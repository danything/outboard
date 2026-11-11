"""基板を組み立てる (2 段目): 自動配線の結果を取り込み、GND のベタと縫いのビアとシルクを足して仕上げる。

入力: build/pre_route.kicad_pcb (make_board.py)、build/route.ses (route.sh)
出力: pcie-tuner-board.kicad_pcb

使い方: "C:\\Program Files\\KiCad\\10.0\\bin\\python.exe" scripts/finish_board.py
"""
from __future__ import annotations

import math
import os
import sys

import pcbnew

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from board_lib import B, F, OX, OY, ROOT, fix_paper, mm, pt, unpt  # noqa: E402

W, H = 90.0, 48.0
SILK = pcbnew.F_SilkS


def add_zone(b, net, layer, pts, name):
    z = pcbnew.ZONE(b)
    z.SetLayer(layer)
    z.SetNet(net)
    ol = z.Outline()
    ol.NewOutline()
    for x, y in pts:
        ol.Append(mm(x + OX), mm(y + OY))
    z.SetLocalClearance(mm(0.25))
    z.SetMinThickness(mm(0.25))
    # パッドは細い橋 (サーマル) でつなぐ: はんだ付けのとき熱が逃げすぎないように。ビアは全面でつながる
    z.SetPadConnection(pcbnew.ZONE_CONNECTION_THERMAL)
    z.SetThermalReliefGap(mm(0.25))
    z.SetThermalReliefSpokeWidth(mm(0.4))
    z.SetIslandRemovalMode(pcbnew.ISLAND_REMOVAL_MODE_ALWAYS)
    z.SetZoneName(name)
    b.Add(z)
    return z


def fill(b):
    pcbnew.ZONE_FILLER(b).Fill(b.Zones())


def in_fill(z, layer, x, y, r):
    """(x, y) を中心に半径 r の円が、ベタの塗りの中に収まっているか (中心と円周の 8 点で見る)。"""
    for i in range(9):
        if i == 0:
            px, py = x, y
        else:
            a = math.radians(45 * i)
            px, py = x + r * math.cos(a), y + r * math.sin(a)
        if not z.HitTestFilledArea(layer, pt(px, py), 0):
            return False
    return True


def stitch(b, gnd, zt, zb, step=2.5):
    """おもてとうらの GND のベタを、格子の上のビアで縫う。両面とも塗りの中で、部品の下でない所にだけ置く。"""
    boxes = []
    for fp in b.GetFootprints():
        bb = fp.GetCourtyard(F).BBox()
        if bb.GetWidth() > 0:
            boxes.append((pcbnew.ToMM(bb.GetLeft()) - OX - 0.5, pcbnew.ToMM(bb.GetTop()) - OY - 0.5,
                          pcbnew.ToMM(bb.GetRight()) - OX + 0.5, pcbnew.ToMM(bb.GetBottom()) - OY + 0.5))
    n = 0
    y = 1.5
    while y <= H - 1.5:
        x = 1.5
        while x <= W - 1.5:
            if not any(x1 <= x <= x2 and y1 <= y <= y2 for x1, y1, x2, y2 in boxes) \
                    and in_fill(zt, F, x, y, 0.7) and in_fill(zb, B, x, y, 0.7):
                v = pcbnew.PCB_VIA(b)
                v.SetPosition(pt(x, y))
                v.SetViaType(pcbnew.VIATYPE_THROUGH)
                v.SetWidth(F, mm(0.6))
                v.SetDrill(mm(0.3))
                v.SetLayerPair(F, B)
                v.SetNet(gnd)
                b.Add(v)
                n += 1
            x += step
        y += step
    return n


def island_vias(b, gnd, zt, zb):
    """GND のビアもスルーホールのパッドも入っていない、ベタの島を見つけて、中にビアを 1 つ置く。"""
    pts = [v.GetPosition() for v in b.GetTracks() if v.Type() == pcbnew.PCB_VIA_T and v.GetNetCode() == gnd.GetNetCode()]
    for fp in b.GetFootprints():
        for pd in fp.Pads():
            if pd.GetNetCode() == gnd.GetNetCode() and pd.GetAttribute() == pcbnew.PAD_ATTRIB_PTH:
                pts.append(pd.GetPosition())
    added, failed = 0, []
    for z, layer in ((zt, F), (zb, B)):
        polys = z.GetFilledPolysList(layer)
        for i in range(polys.OutlineCount()):
            ol = polys.Outline(i)
            bb = ol.BBox()
            sub = pcbnew.SHAPE_POLY_SET()
            sub.AddOutline(ol)
            for h in range(polys.HoleCount(i)):
                sub.AddHole(polys.Hole(i, h))
            if any(bb.Contains(p) and sub.Contains(p) for p in pts):
                continue
            x1, y1 = unpt(pcbnew.VECTOR2I(bb.GetLeft(), bb.GetTop()))
            x2, y2 = unpt(pcbnew.VECTOR2I(bb.GetRight(), bb.GetBottom()))
            done = False
            y = y1 + 0.35
            while y < y2 and not done:
                x = x1 + 0.35
                while x < x2 and not done:
                    if sub.Contains(pt(x, y)) and in_fill(zt, F, x, y, 0.33) and in_fill(zb, B, x, y, 0.33):
                        v = pcbnew.PCB_VIA(b)
                        v.SetPosition(pt(x, y))
                        v.SetViaType(pcbnew.VIATYPE_THROUGH)
                        v.SetWidth(F, mm(0.6))
                        v.SetDrill(mm(0.3))
                        v.SetLayerPair(F, B)
                        v.SetNet(gnd)
                        b.Add(v)
                        pts.append(v.GetPosition())
                        added += 1
                        done = True
                    x += 0.15
                y += 0.15
            if not done:
                failed.append((b.GetLayerName(layer), round((x1 + x2) / 2, 2), round((y1 + y2) / 2, 2),
                               round(x2 - x1, 2), round(y2 - y1, 2)))
    return added, failed


def text(b, s, x, y, size=1.0, thick=0.15, rot=0):
    t = pcbnew.PCB_TEXT(b)
    t.SetText(s)
    t.SetPosition(pt(x, y))
    t.SetLayer(SILK)
    t.SetTextSize(pcbnew.VECTOR2I(mm(size), mm(size)))
    t.SetTextThickness(mm(thick))
    t.SetTextAngleDegrees(rot)
    b.Add(t)


def dot(b, x, y, r=0.2):
    s = pcbnew.PCB_SHAPE(b)
    s.SetShape(pcbnew.SHAPE_T_CIRCLE)
    s.SetCenter(pt(x, y))
    s.SetEnd(pt(x + r / 2, y))
    s.SetLayer(SILK)
    s.SetWidth(mm(r))
    b.Add(s)


# シルクの文字 (文字, x, y[, 大きさ, 線の太さ])。大きさは JLCPCB の最小 (高さ 1.0mm・線 0.15mm) 以上
TEXTS = [
    ("PCIe TUNER EXT PWR", 16.5, 3.0, 1.2, 0.18),
    ("rev B  2026-11", 16.5, 5.2),
    ("<- BRACKET SIDE", 15.0, 8.0),
    ("3V3", 31.4, 9.4),
    ("AUX", 22.2, 29.1),
    ("J4 USB", 68.5, 2.4),
    ("KEY", 72.9, 5.6),
    ("1=5V", 68.6, 18.4),
    ("1 PC", 77.3, 6.6, 1.3, 0.2),
    ("DATA+PWR", 76.3, 8.7),
    ("2 CHARGER", 75.5, 41.4, 1.3, 0.2),
    ("PWR ONLY", 75.5, 43.3),
    ("3V3", 11.4, 17.3),
    ("STAT", 61.7, 42.4),
    ("12V ON", 52.25, 45.0),
    ("SWIO GND", 44.8, 40.2),
    ("VIN", 57.5, 30.0),
    ("3V3", 28.6, 13.6),
    ("12V", 5.2, 37.3),
    ("5V", 55.9, 39.3),
    ("GND", 47.0, 15.9),
]

# 1 番ピンの印 (参照名, 印の位置)。make_board.py の配置と合わせてある
PIN1 = [("U1", 71.9, 20.6), ("U2", 71.9, 29.9), ("U3", 47.3, 10.7), ("U4", 32.6, 38.75), ("U5", 72.2, 10.9),
        ("U6", 67.6, 28.0)]

REF_FIXED = {"R35": (54.7, 31.1, 90)}     # 自動で置き場所が見つからなかった部品番号の位置 (手で決めた)
REF_SIZE = 0.8      # 部品番号の文字の高さ (mm)。線は 0.15mm


def _box(cx, cy, w, h):
    return (cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2)


def _hit(a, b, m=0.0):
    return a[0] < b[2] + m and b[0] < a[2] + m and a[1] < b[3] + m and b[1] < a[3] + m


def place_refs(b, texts):
    """部品番号を全部シルクに出す。パッド・ほかのシルク・ほかの文字に重ならない所を、部品のまわりから探す。
    見つからなかった部品の番号は、シルクに出さない (戻り値の一覧)。"""
    blocks = []                      # 文字を置いてはいけない四角
    for fp in b.GetFootprints():
        for pd in fp.Pads():
            bb = pd.GetBoundingBox()
            x1, y1 = unpt(pcbnew.VECTOR2I(bb.GetLeft(), bb.GetTop()))
            x2, y2 = unpt(pcbnew.VECTOR2I(bb.GetRight(), bb.GetBottom()))
            blocks.append((x1 - 0.2, y1 - 0.2, x2 + 0.2, y2 + 0.2))
        for g in fp.GraphicalItems():
            if g.GetLayer() == SILK:
                bb = g.GetBoundingBox()
                x1, y1 = unpt(pcbnew.VECTOR2I(bb.GetLeft(), bb.GetTop()))
                x2, y2 = unpt(pcbnew.VECTOR2I(bb.GetRight(), bb.GetBottom()))
                if (x2 - x1) * (y2 - y1) < 30:       # 大きな枠 (スロットの外形など) は線ごとの四角にならないので除く
                    blocks.append((x1 - 0.1, y1 - 0.1, x2 + 0.1, y2 + 0.1))
    for t in texts:
        size = t[3] if len(t) > 3 else 1.0
        blocks.append(_box(t[1], t[2], len(t[0]) * size * 0.95 + 0.3, size * 1.2 + 0.2))
    for _r, x, y in PIN1:
        blocks.append(_box(x, y, 0.8, 0.8))
    failed = []
    fps = sorted(b.GetFootprints(), key=lambda f: f.GetReference())
    for fp in fps:
        ref = fp.GetReference()
        cb = fp.GetCourtyard(F).BBox()
        x1, y1 = unpt(pcbnew.VECTOR2I(cb.GetLeft(), cb.GetTop()))
        x2, y2 = unpt(pcbnew.VECTOR2I(cb.GetRight(), cb.GetBottom()))
        cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
        tw, th = len(ref) * REF_SIZE * 0.95 + 0.2, REF_SIZE * 1.2
        found = None
        for d in (0.0, 0.4, 0.8, 1.3, 1.9, 2.6, 3.4, 4.3):
            cands = [(cx, y1 - th / 2 - d, 0), (cx, y2 + th / 2 + d, 0), (x2 + tw / 2 + d, cy, 0),
                     (x1 - tw / 2 - d, cy, 0), (x1 - th / 2 - d, cy, 90), (x2 + th / 2 + d, cy, 90),
                     (x1 + tw / 2, y1 - th / 2 - d, 0), (x2 - tw / 2, y1 - th / 2 - d, 0),
                     (x1 + tw / 2, y2 + th / 2 + d, 0), (x2 - tw / 2, y2 + th / 2 + d, 0),
                     (cx, y1 - tw / 2 - d, 90), (cx, y2 + tw / 2 + d, 90)]
            for px, py, rot in cands:
                bx = _box(px, py, th, tw) if rot else _box(px, py, tw, th)
                if bx[0] < 0.5 or bx[1] < 0.5 or bx[2] > W - 0.5 or bx[3] > H - 0.5:
                    continue
                if any(_hit(bx, k) for k in blocks):
                    continue
                found = (px, py, rot, bx)
                break
            if found:
                break
        r = fp.Reference()
        if not found and ref in REF_FIXED:
            px, py, rot = REF_FIXED[ref]
            found = (px, py, rot, _box(px, py, th, tw) if rot else _box(px, py, tw, th))
        if not found:
            failed.append(ref)
            r.SetVisible(False)
            continue
        r.SetLayer(SILK)
        r.SetVisible(True)
        r.SetPosition(pt(found[0], found[1]))
        r.SetTextSize(pcbnew.VECTOR2I(mm(REF_SIZE), mm(REF_SIZE)))
        r.SetTextThickness(mm(0.15))
        r.SetTextAngleDegrees(found[2])
        r.SetKeepUpright(True)
        blocks.append(found[3])
    return failed


def silk(b):
    # 基板の外にはみ出す、部品のシルクの線を消す (USB-C の口とスイッチのつまみ)
    for ref in ("J1", "J2"):
        fp = b.FindFootprintByReference(ref)
        for g in list(fp.GraphicalItems()):
            if g.GetLayer() != SILK:
                continue
            bb = g.GetBoundingBox()
            x1, y1 = unpt(pcbnew.VECTOR2I(bb.GetLeft(), bb.GetTop()))
            x2, y2 = unpt(pcbnew.VECTOR2I(bb.GetRight(), bb.GetBottom()))
            if x1 < 0.5 or y1 < 0.5 or x2 > W - 0.5 or y2 > H - 0.5:
                fp.Remove(g)
    for t in TEXTS:
        text(b, *t)
    for _ref, x, y in PIN1:
        dot(b, x, y)
    failed = place_refs(b, TEXTS)
    print("reference designators on silk:", len(b.GetFootprints()) - len(failed), "not placed:", " ".join(failed) or "-")


def import_ses():
    """自動配線の結果を取り込んで build/routed.kicad_pcb に保存する。
    (1 つの Python の中で基板を 2 回読むと pcbnew の型がこわれるので、取り込みと仕上げは別のプロセスにする)"""
    src = os.path.join(ROOT, "build", "pre_route.kicad_pcb")
    ses = os.path.join(ROOT, "routing", "route.ses")
    b = pcbnew.LoadBoard(src)
    n0 = len(b.GetTracks())
    ok = pcbnew.ImportSpecctraSES(b, ses)
    print("ImportSpecctraSES:", ok, "tracks+vias", n0, "->", len(b.GetTracks()))
    if not ok:
        return 1
    # 自動配線が残した、片方の面にしか線がつながっていないビアを消す (手で置いたビアは固定してあるので残る)
    items = []
    for t in b.GetTracks():
        via = t.Type() == pcbnew.PCB_VIA_T
        items.append((via, t.GetNetCode(), None if via else t.GetLayer(), t.GetStartX(), t.GetStartY(),
                      t.GetEndX(), t.GetEndY(), t.IsLocked(), t))
    drop = []
    for it in items:
        if not it[0] or it[7]:
            continue
        layers = set()
        for o in items:
            if o[0] or o[1] != it[1]:
                continue
            if min(math.hypot(o[3] - it[3], o[4] - it[4]), math.hypot(o[5] - it[3], o[6] - it[4])) < mm(0.31):
                layers.add(o[2])
        if len(layers) < 2:
            drop.append(it[8])
    for v in drop:
        b.Remove(v)
    print("removed one-sided vias:", len(drop))
    pcbnew.SaveBoard(os.path.join(ROOT, "build", "routed.kicad_pcb"), b, True)
    return 0


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "import":
        return import_ses()
    if len(sys.argv) == 1:
        import subprocess
        r = subprocess.call([sys.executable, os.path.abspath(__file__), "import"])
        if r:
            return r
    dst = os.path.join(ROOT, "pcie-tuner-board.kicad_pcb")
    b = pcbnew.LoadBoard(os.path.join(ROOT, "build", "routed.kicad_pcb"))
    gnd = b.FindNet("/GND")
    # GND のベタ (両面)。基板の外形より外まで描いておけば、外形との間隔はルール (0.3mm) で決まる
    outline = [(-1, -1), (W + 1, -1), (W + 1, H + 1), (-1, H + 1)]
    # スロットのピンの間には、おもてのベタを入れない (細い切れ端の島ができるだけなので。ピンの GND はうらのベタでつながる)
    ko = pcbnew.ZONE(b)
    ko.SetIsRuleArea(True)
    ko.SetLayer(F)
    ko.SetDoNotAllowZoneFills(True)
    ko.SetDoNotAllowTracks(False)
    ko.SetDoNotAllowVias(False)
    ko.SetDoNotAllowPads(False)
    ko.SetDoNotAllowFootprints(False)
    ko.SetZoneName("slot-no-top-pour")
    kol = ko.Outline()
    kol.NewOutline()
    for x, y in ((6.9, 18.2), (28.3, 18.2), (28.3, 26.8), (6.9, 26.8)):
        kol.Append(mm(x + OX), mm(y + OY))
    b.Add(ko)
    zt = add_zone(b, gnd, F, outline, "GND-top")
    zb = add_zone(b, gnd, B, outline, "GND-bottom")
    fill(b)
    n = stitch(b, gnd, zt, zb)
    print("stitching vias:", n)
    fill(b)
    for _ in range(3):
        added, failed = island_vias(b, gnd, zt, zb)
        print("island vias:", added, "islands without room for a via:", failed)
        if not added:
            break
        fill(b)
    silk(b)
    tb = b.GetTitleBlock()
    tb.SetTitle("PCIe tuner external power board")
    tb.SetRevision("B")
    tb.SetDate("2026-11-11")
    pcbnew.SaveBoard(dst, b, True)
    fix_paper(dst)
    print("saved", dst)
    return 0


if __name__ == "__main__":
    sys.exit(main())
