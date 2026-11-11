"""pcbnew で基板を組み立てるための小道具。座標は「基板の左上の角を (0, 0)、x は右、y は下」の mm。"""
from __future__ import annotations

import math
import os
import sys

import pcbnew

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from check_netlist import load as load_netlist  # noqa: E402
from sexpr import find, find_all, parse  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIBDIR = os.path.join(ROOT, "lib", "pcie-tuner.pretty")
OX, OY = 20.0, 20.0          # 基板の左上の角の、KiCad の紙の上での位置 (紙は 130 x 85mm)
F, B = pcbnew.F_Cu, pcbnew.B_Cu


def mm(v):
    return pcbnew.FromMM(float(v))


def pt(x, y):
    return pcbnew.VECTOR2I(mm(x + OX), mm(y + OY))


def unpt(v):
    return (pcbnew.ToMM(v.x) - OX, pcbnew.ToMM(v.y) - OY)


def netlist_uuids():
    """ネットリストから、部品ごとのシンボルの UUID を読む (基板と回路図の一致の検査に要る)。"""
    t = parse(open(os.path.join(ROOT, "out", "netlist.net"), encoding="utf-8").read())
    res = {}
    for c in find_all(find(t, "components"), "comp"):
        ts = find(c, "tstamps")
        d = find(c, "description")
        res[str(find(c, "ref")[1])] = (str(ts[1]), str(d[1]) if d and len(d) > 1 else "")
    return res


class Board:
    def __init__(self):
        self.b = pcbnew.CreateEmptyBoard()
        self.b.SetCopperLayerCount(2)
        ds = self.b.GetDesignSettings()
        ds.SetBoardThickness(mm(1.6))
        ds.SetAuxOrigin(pt(0, 0))
        ds.SetGridOrigin(pt(0, 0))
        self.comps, self.nets, self.pin, self.func = load_netlist()
        self.uuids = netlist_uuids()
        self.fps = {}
        self.netinfo = {}
        for name in self.nets:
            ni = pcbnew.NETINFO_ITEM(self.b, "/" + name if not name.startswith("unconnected-") else name)
            self.b.Add(ni)
            self.netinfo[name] = ni

    # ---- 部品 -------------------------------------------------------------
    def place(self, ref, x, y, rot=0, pin1=None):
        """部品を置く。pin1 に 'N' 'S' 'E' 'W' を渡すと、パッド 1 がその向きに来る角度を選ぶ。"""
        c = self.comps[ref]
        lib, name = c["footprint"].split(":")
        fp = pcbnew.FootprintLoad(LIBDIR, name)
        assert fp is not None, name
        fp.SetReference(ref)
        fp.SetValue(c["value"])
        fp.SetFPID(pcbnew.LIB_ID(lib, name))
        fp.SetPath(pcbnew.KIID_PATH("/" + self.uuids[ref][0]))
        fp.SetField("Description", self.uuids[ref][1])
        fp.GetField("Description").SetVisible(False)
        fp.SetSheetname("/")
        fp.SetSheetfile("pcie-tuner-board.kicad_sch")
        for k in ("LCSC", "MPN"):
            if k in c["fields"]:
                fp.SetField(k, c["fields"][k])
                fp.GetField(k).SetVisible(False)
        if ref.startswith(("TP", "H", "JP3", "JP4")):
            fp.SetExcludedFromBOM(True)
            fp.SetExcludedFromPosFiles(True)
        self.b.Add(fp)
        fp.SetPosition(pt(x, y))
        if pin1:
            want = {"N": (0, -1), "S": (0, 1), "E": (1, 0), "W": (-1, 0)}[pin1]
            best = None
            for r in (0, 90, 180, 270):
                fp.SetOrientationDegrees(r)
                p = [pd for pd in fp.Pads() if pd.GetNumber() == "1"][0]
                px, py = unpt(p.GetPosition())
                dot = (px - x) * want[0] + (py - y) * want[1]
                if best is None or dot > best[0]:
                    best = (dot, r)
            rot = best[1]
        fp.SetOrientationDegrees(rot)
        for pd in fp.Pads():
            num = pd.GetNumber()
            if num and (ref, num) in self.pin:
                pd.SetNet(self.netinfo[self.pin[(ref, num)]])
        fp.Reference().SetVisible(False)
        fp.Value().SetVisible(False)
        self.fps[ref] = fp
        return fp

    def P(self, ref, num, which=0):
        """パッドの中心 (基板の座標)。同じ番号のパッドが複数あるときは which で選ぶ。"""
        pads = [pd for pd in self.fps[ref].Pads() if pd.GetNumber() == num]
        pads.sort(key=lambda p: (p.GetPosition().x, p.GetPosition().y))
        return unpt(pads[which].GetPosition())

    def padnet(self, ref, num):
        return self.pin[(ref, num)]

    # ---- 配線 -------------------------------------------------------------
    def track(self, net, width, pts, layer=F):
        ni = self.netinfo[net]
        for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
            if abs(x1 - x2) < 1e-6 and abs(y1 - y2) < 1e-6:
                continue
            t = pcbnew.PCB_TRACK(self.b)
            t.SetStart(pt(x1, y1))
            t.SetEnd(pt(x2, y2))
            t.SetWidth(mm(width))
            t.SetLayer(layer)
            t.SetNet(ni)
            self.b.Add(t)

    def via(self, net, x, y, dia=0.6, drill=0.3):
        v = pcbnew.PCB_VIA(self.b)
        v.SetPosition(pt(x, y))
        v.SetViaType(pcbnew.VIATYPE_THROUGH)
        v.SetWidth(pcbnew.F_Cu, mm(dia)) if _via_width_takes_layer() else v.SetWidth(mm(dia))
        v.SetDrill(mm(drill))
        v.SetLayerPair(F, B)
        v.SetNet(self.netinfo[net])
        self.b.Add(v)
        return v

    def gnd_via(self, x, y, frm=None, width=0.4, **kw):
        """GND のビア。frm (パッドの中心など) を渡すと、そこから短い線でつなぐ。"""
        if frm:
            self.track("GND", width, [frm, (x, y)])
        return self.via("GND", x, y, **kw)

    # ---- 図形・文字 -------------------------------------------------------
    def line(self, layer, x1, y1, x2, y2, width=0.15):
        s = pcbnew.PCB_SHAPE(self.b)
        s.SetShape(pcbnew.SHAPE_T_SEGMENT)
        s.SetStart(pt(x1, y1))
        s.SetEnd(pt(x2, y2))
        s.SetLayer(layer)
        s.SetWidth(mm(width))
        self.b.Add(s)

    def arc(self, layer, cx, cy, r, a0, a1, width=0.15):
        """中心 (cx, cy)、半径 r。a0 から a1 まで (度。0 = 右、90 = 下)。"""
        s = pcbnew.PCB_SHAPE(self.b)
        s.SetShape(pcbnew.SHAPE_T_ARC)
        am = (a0 + a1) / 2
        f = lambda a: pt(cx + r * math.cos(math.radians(a)), cy + r * math.sin(math.radians(a)))  # noqa: E731
        s.SetArcGeometry(f(a0), f(am), f(a1))
        s.SetLayer(layer)
        s.SetWidth(mm(width))
        self.b.Add(s)

    def circle(self, layer, cx, cy, r, width=0.15, fill=False):
        s = pcbnew.PCB_SHAPE(self.b)
        s.SetShape(pcbnew.SHAPE_T_CIRCLE)
        s.SetCenter(pt(cx, cy))
        s.SetEnd(pt(cx + r, cy))
        s.SetLayer(layer)
        s.SetWidth(mm(width))
        if fill:
            s.SetFilled(True)
        self.b.Add(s)

    def text(self, s, x, y, size=1.0, thick=0.15, layer=pcbnew.F_SilkS, rot=0, just="C"):
        t = pcbnew.PCB_TEXT(self.b)
        t.SetText(s)
        t.SetPosition(pt(x, y))
        t.SetLayer(layer)
        t.SetTextSize(pcbnew.VECTOR2I(mm(size), mm(size)))
        t.SetTextThickness(mm(thick))
        t.SetTextAngleDegrees(rot)
        t.SetHorizJustify({"L": pcbnew.GR_TEXT_H_ALIGN_LEFT, "C": pcbnew.GR_TEXT_H_ALIGN_CENTER,
                           "R": pcbnew.GR_TEXT_H_ALIGN_RIGHT}[just])
        self.b.Add(t)
        return t

    def ref_text(self, ref, x, y, size=1.0, rot=0):
        """部品の参照名 (U1 など) を、シルクのこの位置に見せる。"""
        r = self.fps[ref].Reference()
        r.SetVisible(True)
        r.SetLayer(pcbnew.F_SilkS)
        r.SetPosition(pt(x, y))
        r.SetTextSize(pcbnew.VECTOR2I(mm(size), mm(size)))
        r.SetTextThickness(mm(0.15))
        r.SetTextAngleDegrees(rot)
        r.SetKeepUpright(True)

    def zone(self, net, layer, pts, clearance=0.25, min_width=0.25, priority=0, thermal=True, name=None):
        z = pcbnew.ZONE(self.b)
        z.SetLayer(layer)
        if net:
            z.SetNet(self.netinfo[net])
        ol = z.Outline()
        ol.NewOutline()
        for x, y in pts:
            ol.Append(mm(x + OX), mm(y + OY))
        z.SetLocalClearance(mm(clearance))
        z.SetMinThickness(mm(min_width))
        z.SetAssignedPriority(priority)
        z.SetPadConnection(pcbnew.ZONE_CONNECTION_THERMAL if thermal else pcbnew.ZONE_CONNECTION_FULL)
        z.SetThermalReliefGap(mm(0.3))
        z.SetThermalReliefSpokeWidth(mm(0.5))
        z.SetIslandRemovalMode(pcbnew.ISLAND_REMOVAL_MODE_ALWAYS)
        if name:
            z.SetZoneName(name)
        self.b.Add(z)
        return z

    def keepout(self, layers, pts, tracks=True, vias=False, pour=False, name="keepout"):
        z = pcbnew.ZONE(self.b)
        z.SetIsRuleArea(True)
        ls = pcbnew.LSET()
        for la in layers:
            ls.AddLayer(la)
        z.SetLayerSet(ls)
        z.SetDoNotAllowTracks(tracks)
        z.SetDoNotAllowVias(vias)
        z.SetDoNotAllowZoneFills(pour)
        z.SetDoNotAllowPads(False)
        z.SetDoNotAllowFootprints(False)
        ol = z.Outline()
        ol.NewOutline()
        for x, y in pts:
            ol.Append(mm(x + OX), mm(y + OY))
        z.SetZoneName(name)
        self.b.Add(z)
        return z

    def save(self, path):
        pcbnew.SaveBoard(path, self.b, True)
        fix_paper(path)


def fix_paper(path):
    """紙の大きさを基板に合わせる (PDF や SVG に書き出したとき、基板が紙いっぱいに写るように)。"""
    import re
    t = open(path, encoding="utf-8").read()
    t2 = re.sub(r'\(paper "[^"]*"[^)]*\)', '(paper "User" 130 85)', t, count=1)
    if t2 != t:
        open(path, "w", encoding="utf-8", newline="\n").write(t2)


_VW = None


def _via_width_takes_layer():
    global _VW
    if _VW is None:
        try:
            v = pcbnew.PCB_VIA(pcbnew.CreateEmptyBoard())
            v.SetWidth(pcbnew.F_Cu, 600000)
            _VW = True
        except TypeError:
            _VW = False
    return _VW


def rect(x1, y1, x2, y2):
    return [(x1, y1), (x2, y1), (x2, y2), (x1, y2)]
