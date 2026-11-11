"""できあがった基板 (pcie-tuner-board.kicad_pcb) を、DRC とは別の目で検査する。rev C。

- 電源の道すじの「いちばん細い所」の幅 (線・面・パッド・ビアをたどって、端子から端子まで)
- USB の D+ と D- の長さの差、CC の線が USB-C の殻の下を通っていないこと
- 機構: USB-C の口の面とブラケットの外の面、ブラケットをよける段、取り付け穴、LED の位置
- スロットと USB-C の向き、部品が全部おもてにあること、線とビアの最小の大きさ、うらの面の配線の量
結果は out/board_check.txt に残す。NG があれば終了コード 1。

使い方: "C:\\Program Files\\KiCad\\10.0\\bin\\python.exe" scripts/check_board.py
"""
from __future__ import annotations

import heapq
import math
import os
import sys

import pcbnew

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from board_lib import OX, OY, ROOT  # noqa: E402
import make_board as MB  # noqa: E402

MM = pcbnew.ToMM


def inside(poly, x, y):
    n, c = len(poly), False
    for i in range(n):
        (x1, y1), (x2, y2) = poly[i], poly[(i + 1) % n]
        if (y1 > y) != (y2 > y) and x < x1 + (x2 - x1) * (y - y1) / (y2 - y1):
            c = not c
    return c


class Net:
    """1 本のネットの銅 (線・ビア・パッド・面) を節点にしたグラフ。座標は KiCad の紙の上の mm。"""

    def __init__(self, b, name):
        code = b.FindNet("/" + name).GetNetCode()
        self.nodes = []      # (種類, 層 or None, x1, y1, x2, y2, 幅, 名前)
        self.polys = {}
        for t in b.GetTracks():
            if t.GetNetCode() != code:
                continue
            if t.Type() == pcbnew.PCB_VIA_T:
                self.nodes.append(("via", None, MM(t.GetStartX()), MM(t.GetStartY()), MM(t.GetStartX()),
                                   MM(t.GetStartY()), MM(t.GetWidth(pcbnew.F_Cu)), "via"))
            else:
                self.nodes.append(("seg", t.GetLayer(), MM(t.GetStartX()), MM(t.GetStartY()), MM(t.GetEndX()),
                                   MM(t.GetEndY()), MM(t.GetWidth()), "track"))
        for fp in b.GetFootprints():
            for pd in fp.Pads():
                if pd.GetNetCode() == code:
                    bb = pd.GetBoundingBox()
                    th = pd.GetAttribute() == pcbnew.PAD_ATTRIB_PTH
                    self.nodes.append(("pad", None if th else pcbnew.F_Cu, MM(bb.GetLeft()), MM(bb.GetTop()),
                                       MM(bb.GetRight()), MM(bb.GetBottom()),
                                       min(MM(bb.GetWidth()), MM(bb.GetHeight())),
                                       f"{fp.GetReference()}.{pd.GetNumber()}"))
        for z in b.Zones():
            if z.GetNetCode() == code and not z.GetIsRuleArea():
                ch = z.Outline().Outline(0)
                self.polys[len(self.nodes)] = [(MM(ch.CPoint(i).x), MM(ch.CPoint(i).y)) for i in range(ch.PointCount())]
                self.nodes.append(("zone", z.GetLayer(), 0, 0, 0, 0, 99.0, "zone " + z.GetZoneName()))
        n = len(self.nodes)
        self.adj = [[] for _ in range(n)]
        for i in range(n):
            for j in range(i + 1, n):
                if self.touch(i, j):
                    self.adj[i].append(j)
                    self.adj[j].append(i)

    @staticmethod
    def dseg(px, py, s):
        ax, ay, cx, cy = s[2], s[3], s[4], s[5]
        dx, dy = cx - ax, cy - ay
        L2 = dx * dx + dy * dy
        u = 0 if L2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L2))
        return math.hypot(px - (ax + u * dx), py - (ay + u * dy))

    def touch(self, i, j):
        a, b = self.nodes[i], self.nodes[j]
        if a[1] is not None and b[1] is not None and a[1] != b[1]:
            return False
        if a[0] == "zone" or b[0] == "zone":
            if a[0] == b[0]:
                return False
            if b[0] == "zone":
                a, b, i, j = b, a, j, i
            poly = self.polys[i]                 # a が面。b の端 (線)、中心 (パッド・ビア) が面の中にあるか
            if b[0] == "seg":
                return inside(poly, b[2], b[3]) or inside(poly, b[4], b[5])
            return inside(poly, (b[2] + b[4]) / 2, (b[3] + b[5]) / 2)
        if a[0] == "pad" and b[0] == "pad":
            return False
        if a[0] == "pad":
            a, b = b, a
        if b[0] == "pad":       # a は線かビア: 端がパッドの四角の中にあるか
            return any(b[2] - 0.01 <= x <= b[4] + 0.01 and b[3] - 0.01 <= y <= b[5] + 0.01
                       for x, y in ((a[2], a[3]), (a[4], a[5])))
        if a[0] == "via" and b[0] == "via":
            return False
        if a[0] == "via":
            a, b = b, a
        if b[0] == "via":
            return self.dseg(b[2], b[3], a) <= max(a[6], b[6]) / 2 + 0.01
        return (min(self.dseg(a[2], a[3], b), self.dseg(a[4], a[5], b)) <= b[6] / 2 + 0.01
                or min(self.dseg(b[2], b[3], a), self.dseg(b[4], b[5], a)) <= a[6] / 2 + 0.01)

    def find(self, padname):
        return [i for i, nd in enumerate(self.nodes) if nd[7] == padname]

    def widest(self, src, dst):
        """src から dst までの道のうち、いちばん細い所がいちばん太い道。その細い所の幅を返す (パッドと面は数えない)。"""
        best = {}
        heap = [(-99.0, i) for i in self.find(src)]
        goal = set(self.find(dst))
        while heap:
            w, i = heapq.heappop(heap)
            w = -w
            if i in best:
                continue
            best[i] = w
            if i in goal:
                return w
            for j in self.adj[i]:
                if j not in best:
                    cap = self.nodes[j][6] if self.nodes[j][0] in ("seg", "via") else 99.0
                    heapq.heappush(heap, (-min(w, cap), j))
        return None

    def cost(self, src, dst, f):
        """src から dst までの、f(節点) の合計がいちばん小さい道の合計。"""
        dist = {}
        heap = [(0.0, i) for i in self.find(src)]
        goal = set(self.find(dst))
        while heap:
            d, i = heapq.heappop(heap)
            if i in dist:
                continue
            dist[i] = d
            if i in goal:
                return d
            for j in self.adj[i]:
                if j not in dist:
                    heapq.heappush(heap, (d + f(self.nodes[j]), j))
        return None

    def shortest(self, src, dst):
        return self.cost(src, dst, lambda nd: math.hypot(nd[4] - nd[2], nd[5] - nd[3]) if nd[0] == "seg" else 0.0)


def main():
    b = pcbnew.LoadBoard(os.path.join(ROOT, "pcie-tuner-board.kicad_pcb"))
    rows = []
    ng = 0

    def ok(title, cond, detail=""):
        nonlocal ng
        rows.append(f"[{'OK' if cond else 'NG'}] {title}" + (f"\n       {detail}" if detail else ""))
        ng += 0 if cond else 1

    pos, fpos, fps = {}, {}, {}
    for fp in b.GetFootprints():
        fps[fp.GetReference()] = fp
        fpos[fp.GetReference()] = (MM(fp.GetPosition().x) - OX, MM(fp.GetPosition().y) - OY)
        for pd in fp.Pads():
            p = pd.GetPosition()
            pos[(fp.GetReference(), pd.GetNumber())] = (MM(p.x) - OX, MM(p.y) - OY)
    tracks = list(b.GetTracks())
    segs = [(t.GetNetname().lstrip("/"), t.GetLayer(), MM(t.GetStartX()) - OX, MM(t.GetStartY()) - OY,
             MM(t.GetEndX()) - OX, MM(t.GetEndY()) - OY, MM(t.GetWidth())) for t in tracks if t.Type() != pcbnew.PCB_VIA_T]
    vias = [(MM(t.GetStartX()) - OX, MM(t.GetStartY()) - OY, t.GetNetname().lstrip("/"), MM(t.GetWidth(pcbnew.F_Cu)),
             MM(t.GetDrill())) for t in tracks if t.Type() == pcbnew.PCB_VIA_T]

    # ---- 電源の道すじの幅 ------------------------------------------------------
    paths = [
        ("VBUS1", "J1.A4B9", "D1.1", 0.6, "① の VBUS (上のパッド) -> おもての面 -> D1"),
        ("VBUS1", "J1.B4A9", "D1.1", 0.5, "① の VBUS (下のパッド) -> うらの帯 -> D1 (ビアは外径 0.8mm が 2 個と 6 個)"),
        ("VBUS2", "J2.A4B9", "D2.1", 0.6, "② の VBUS (上のパッド) -> おもての面 -> D2"),
        ("VBUS2", "J2.B4A9", "D2.1", 0.5, "② の VBUS (下のパッド) -> うらの橋 -> おもての面 -> D2"),
        ("VIN", "D1.2", "C9.1", 1.5, "VIN: D1 -> 降圧の入力コンデンサ"),
        ("VIN", "D2.2", "C9.1", 1.5, "VIN: D2 -> 降圧の入力コンデンサ"),
        ("VIN", "D1.2", "L2.1", 0.8, "VIN: D1 -> うらの面 -> 昇圧のコイル (ビアは外径 0.8mm が 8 個と 6 個)"),
        ("+3V3_BUCK", "L1.2", "JP1.1", 1.5, "3.3V: コイル -> JP1"),
        ("+3V3", "JP1.2", "J3.A10", 1.5, "3.3V: JP1 -> スロット A10"),
        ("+3V3", "JP1.2", "J3.B8", 1.5, "3.3V: JP1 -> スロット B8"),
        ("+3V3", "JP5.2", "J3.A10", 1.0, "3.3V: JP5 (はんだジャンパー) -> スロット A10"),
        ("+3V3", "J3.A10", "J3.A9", 0.8, "3.3V: A10 -> A9 (ピン 1 本ぶん、最大 1.1A)"),
        ("+12V_BOOST", "D4.1", "Q1.2", 0.8, "12V: D4 -> Q1"),
        ("+12V_SW", "Q1.3", "F1.1", 0.8, "12V: Q1 -> F1 (ヒューズ)"),
        ("+12V_F", "F1.2", "JP2.1", 0.6, "12V: F1 -> JP2"),
        ("+12V_F", "F1.2", "JP6.1", 0.8, "12V: F1 -> JP6 (はんだジャンパー)"),
        ("+12V", "JP2.2", "J3.B2", 0.8, "12V: JP2 -> スロット B2"),
        ("+12V", "JP6.2", "J3.B2", 1.0, "12V: JP6 -> スロット B2"),
        ("+12V", "JP2.2", "J3.A3", 0.8, "12V: JP2 -> スロット A3 (B3 から向かいの A3 へ)"),
        ("+12V", "JP2.2", "J3.B3", 0.8, "12V: JP2 -> スロット B3"),
        ("+12V", "JP2.2", "J3.B1", 0.8, "12V: JP2 -> スロット B1"),
        ("+12V", "JP2.2", "J3.A2", 0.8, "12V: JP2 -> スロット A2"),
    ]
    cache = {}
    for net, a, c, need, title in paths:
        g = cache.setdefault(net, Net(b, net))
        w = g.widest(a, c)
        ok(f"{title}: いちばん細い所が {need}mm 以上", w is not None and w >= need - 1e-6,
           "つながっていない" if w is None else ("面とパッドだけ" if w > 90 else f"{w:.2f} mm"))

    def res(net, a, c):
        """a から c までの銅の抵抗 (mΩ)。1oz の銅を 0.49mΩ/□ として、線の長さ / 幅を足す (面は 0 と数える)。"""
        g = cache.setdefault(net, Net(b, net))
        return g.cost(a, c, lambda nd: 0.49 * math.hypot(nd[4] - nd[2], nd[5] - nd[3]) / nd[6] if nd[0] == "seg" else 0.0)

    ra, rb = res("+3V3", "JP1.2", "J3.A10"), res("+3V3", "JP1.2", "J3.B8")
    ok("3.3V: JP1 から A10 までと B8 までの銅の抵抗 (記録するだけ。そろってはいない)", True,
       f"A10 まで {ra:.1f} mΩ、B8 まで {rb:.1f} mΩ")

    # ---- USB -----------------------------------------------------------------
    dp, dn = Net(b, "USB_DP"), Net(b, "USB_DN")
    lp, ln = dp.shortest("J1.B6", "J4.5"), dn.shortest("J1.A7", "J4.3")
    ok("USB: D+ (J1 B6 -> J4 5) と D- (J1 A7 -> J4 3) の長さの差が 0.5mm 以下", abs(lp - ln) <= 0.5,
       f"D+ {lp:.2f} mm、D- {ln:.2f} mm、差 {abs(lp - ln):.2f} mm")
    ok("USB: 裏返しのパッド (A6・B7) も同じ線につながっている", dp.shortest("J1.A6", "J4.5") is not None
       and dn.shortest("J1.B7", "J4.3") is not None,
       f"枝の長さ: A6 から {dp.shortest('J1.A6', 'J1.B6'):.1f} mm、B7 から {dn.shortest('J1.B7', 'J1.A7'):.1f} mm")
    usb_b = sum(math.hypot(nd[4] - nd[2], nd[5] - nd[3]) for g in (dp, dn) for nd in g.nodes
                if nd[0] == "seg" and nd[1] == pcbnew.B_Cu)
    ok("USB: うらの面を通るのは A6 の橋 (約 2.3mm) だけ", usb_b < 2.6, f"{usb_b:.2f} mm")

    # ---- CC の線は USB-C の殻の下を通らない -------------------------------------
    for j in ("J1", "J2"):
        jx, jy = fpos[j]
        box = (jx - 5.2, jy - 4.5, jx + 1.75, jy + 4.5)      # 殻の外形: 口 (原点から 5.07mm) から、後ろの足の列まで
        bad = []
        for net, _lay, x1, y1, x2, y2, _w in segs:
            if net.startswith(j + "_CC"):
                for k in range(21):
                    x, y = x1 + (x2 - x1) * k / 20, y1 + (y2 - y1) * k / 20
                    if box[0] <= x <= box[2] and box[1] <= y <= box[3]:
                        bad.append(f"{net} ({x:.2f}, {y:.2f})")
                        break
        bad += [f"{n} via ({x:.2f}, {y:.2f})" for x, y, n, _d, _h in vias
                if n.startswith(j + "_CC") and box[0] <= x <= box[2] and box[1] <= y <= box[3]]
        ncc = sum(1 for s in segs if s[0].startswith(j + "_CC"))
        ok(f"{j}: CC1・CC2 の線とビアが、殻の下 (x {box[0]:.2f}〜{box[2]:.2f}、y {box[1]:.2f}〜{box[3]:.2f}) に入っていない",
           not bad and ncc > 0, " / ".join(bad) or f"線 {ncc} 本とも殻の外 (パッドから奥へ出ている)")
        under = [(round(x, 2), round(y, 2)) for x, y, _n, _d, _h in vias if x < jx + 1.75 and abs(y - jy) < 3.7]
        ok(f"{j}: 殻の下にビアが無い", not under, str(under) if under else "0 個")
        for num in ("A1B12", "B1A12"):
            px, py = pos[(j, num)]
            n = sum(1 for x, y, nn, _d, _h in vias if nn == "GND" and math.hypot(x - px, y - py) <= 2.0)
            ok(f"{j}: GND のパッド {num} から 2mm 以内に GND のビアが 2 個以上", n >= 2, f"{n} 個")

    # ---- 銅の面積 ----------------------------------------------------------------
    def copper(net, layer):
        """ネットの、ある面の銅の面積 (mm2)。線は 長さ x 幅、面は塗りの面積。重なりは引かないので、少し多めに出る。"""
        a = sum(math.hypot(x2 - x1, y2 - y1) * w for n, lay, x1, y1, x2, y2, w in segs if n == net and lay == layer)
        for z in b.Zones():
            if z.GetNetname().lstrip("/") == net and not z.GetIsRuleArea() and z.GetLayer() == layer:
                a += z.GetFilledArea() / 1e12
        return a

    for net, title, need in (("VBUS1", "D1 のアノード (VBUS1)", 150), ("VBUS2", "D2 のアノード (VBUS2)", 150),
                             ("VIN", "D1・D2 のカソード (VIN。2 個で共用なので 150 x 2)", 300)):
        t_, b_ = copper(net, pcbnew.F_Cu), copper(net, pcbnew.B_Cu)
        ok(f"{title} につながるおもての銅が {need}mm2 以上", t_ >= need, f"おもて 約 {t_:.0f} mm2、うら 約 {b_:.0f} mm2")
    for d in ("D1", "D2"):
        kx, ky = pos[(d, "2")]
        n = sum(1 for x, y, nn, dia, _h in vias if nn == "VIN" and math.hypot(x - kx, y - ky) <= 4.0 and dia >= 0.79)
        ok(f"{d}: カソードのパッドから 4mm 以内に、うらの VIN の面へ降りるビア (外径 0.8mm) が 6 個以上", n >= 6, f"{n} 個")

    # ---- 降圧と昇圧のまわり ------------------------------------------------------
    zones = {z.GetZoneName(): z for z in b.Zones()}

    def in_zone(name, x, y):
        z = zones.get(name)
        return z is not None and z.HitTestFilledArea(z.GetLayer(), pcbnew.VECTOR2I(pcbnew.FromMM(x + OX), pcbnew.FromMM(y + OY)), 0)

    def buck(x, y):
        """rev B の降圧のまわりの座標 (U3 が (47, 9)) を、いまの基板の座標に直す (90 度回してある)。"""
        return (MB.U3X + (y - 9.0), MB.U3Y - (x - 47.0))

    def gnd_vias_near(ref, num, r):
        px, py = pos[(ref, num)]
        return sum(1 for x, y, n, _d, _h in vias if n == "GND" and math.hypot(x - px, y - py) <= r)

    u3x, u3y = 47.0, 9.0
    pts = [(u3x - 1.8 - 0.23 * i, u3y - 1.7 - 0.21 * i + dy) for i in range(8) for dy in (-0.6, 0.0, 0.6)]
    ok("U3: SW (5 番ピン -> L1) は面でつながり、途中の帯の幅が 1.2mm 以上", all(in_zone("U3-SW", *buck(x, y)) for x, y in pts)
       and in_zone("U3-SW", *buck(u3x - 1.2, u3y - 0.75)), f"{len(pts)} 点とも SW の面の中")
    ok("U3: VIN (3 番ピン) と GND (4 番ピン) は、パッドのすぐ外 (0.35mm) から面", in_zone("U3-VIN", *buck(u3x + 1.35, u3y - 0.25))
       and in_zone("U3-GND", *buck(u3x + 1.35, u3y - 0.75)))
    n = gnd_vias_near("U3", "4", 4.6)
    ok("U3: GND の 4 番ピンから 4.6mm 以内に GND のビアが 4 個以上 (面でつながる)", n >= 4, f"{n} 個")
    n = gnd_vias_near("U4", "2", 2.2)
    ok("U4: GND の 2 番ピンから 2.2mm 以内に GND のビアが 2 個以上", n >= 2, f"{n} 個")
    hot = cache.setdefault("+12V_BOOST", Net(b, "+12V_BOOST")).shortest("D4.1", "C18.1")
    d_ = math.hypot(pos[("C18", "2")][0] - pos[("U4", "2")][0], pos[("C18", "2")][1] - pos[("U4", "2")][1])
    ok("U4: 熱い輪。D4 のカソードから C18 まで 4mm 以下、C18 の GND から U4 の 2 番ピンまで直線で 3.5mm 以下",
       hot is not None and hot <= 4.0 and d_ <= 3.5, f"D4 -> C18 {hot:.1f} mm、C18 -> U4 {d_:.1f} mm")
    fx, fy = fpos["F1"]
    ds = {r: math.hypot(fpos[r][0] - fx, fpos[r][1] - fy) for r in ("Q1", "D4", "L2")}
    ok("F1 (PTC) は、熱くなる Q1・D4・L2 から中心どうしで 8mm 以上離れている", min(ds.values()) >= 8.0,
       "、".join(f"{r} から {v:.1f} mm" for r, v in ds.items()))
    # JP5 (3.3V の 3A が通る、閉じたはんだジャンパー) の橋の幅
    wb = 0.0
    for g in fps["JP5"].GraphicalItems():
        if g.GetLayer() == pcbnew.F_Cu:
            bb = g.GetBoundingBox()
            wb = max(MM(bb.GetWidth()), MM(bb.GetHeight()))
    ok("JP5: 2 つのパッドをつなぐ銅の橋の幅が 1.0mm 以上", wb >= 0.999, f"{wb:.2f} mm")

    # ---- うらの面 ----------------------------------------------------------------
    lens = {}
    for net, lay, x1, y1, x2, y2, _w in segs:
        if lay == pcbnew.B_Cu:
            lens[net] = lens.get(net, 0.0) + math.hypot(x2 - x1, y2 - y1)
    lb = sum(lens.values())
    lf = sum(math.hypot(x2 - x1, y2 - y1) for _n, lay, x1, y1, x2, y2, _w in segs if lay == pcbnew.F_Cu)
    ok("うらの面の線の長さの合計が 300mm 以下 (目標は 150mm 以下。" + ("届いている" if lb <= 150 else "届いていない") + ")", lb <= 300.0,
       f"うら {lb:.0f} mm (おもて {lf:.0f} mm)。長い順: " + ", ".join(f"{k} {v:.0f}" for k, v in sorted(lens.items(), key=lambda kv: -kv[1])[:10]))
    boxes = {"降圧": (68.6, 8.4, 83.4, 39.0), "昇圧": (MB.U4X - 0.6, 45.2, 35.0, 60.2),
             "USB のデータ線 (D+ 自身の A6 の渡り 2.3mm は除く)": (MB.JX + 7.12, MB.J1Y - 1.3, MB.JX + 16.92, MB.J1Y + 3.2)}
    for name, (bx1, by1, bx2, by2) in boxes.items():
        hit = sorted({net for net, lay, x1, y1, x2, y2, _w in segs if lay == pcbnew.B_Cu and net != "USB_DP"
                      and any(bx1 <= x1 + (x2 - x1) * k / 20 <= bx2 and by1 <= y1 + (y2 - y1) * k / 20 <= by2 for k in range(21))})
        ok(f"うらの面: {name}の下 (x {bx1:.1f}〜{bx2:.1f}、y {by1:.1f}〜{by2:.1f}) を通る線が無い", not hit, " ".join(hit) or "0 本")

    # ---- スロット ----------------------------------------------------------------
    for num in ("A11", "B11"):
        pd = [p for p in fps["J3"].Pads() if p.GetNumber() == num][0]
        gap = math.hypot(1.65, 1.25) - 2.35 / 2 - MM(pd.GetSizeX()) / 2
        wall = math.hypot(1.65, 1.25) - 2.35 / 2 - MM(pd.GetDrillSizeX()) / 2
        ok(f"J3: {num} のパッドと、切り欠きの横の柱の穴 (2.35mm) の間が 0.27mm 以上、穴と穴の間の壁が 0.45mm 以上",
           gap >= 0.27 - 1e-6 and wall >= 0.45, f"銅まで {gap:.3f} mm、穴の壁 {wall:.3f} mm")
    holes = sorted(round(MM(p.GetDrillSizeX()), 2) for p in fps["J3"].Pads() if p.GetAttribute() == pcbnew.PAD_ATTRIB_NPTH)
    ok("J3: 柱の穴は 2 か所とも 2.35mm (UMAX の図面の推奨 ø2.35±0.05。柱は ø2.20±0.10 と ø2.05±0.10)",
       holes == [2.35, 2.35], str(holes))
    a1, a18, b1 = pos[("J3", "A1")], pos[("J3", "A18")], pos[("J3", "B1")]
    ok("J3: 1 番ピンが左 (ブラケットの側)、18 番が右。A 面が上、B 面が下", a1[0] < a18[0] and a1[1] < b1[1]
       and abs(a1[0] - b1[0]) < 0.01, f"A1 ({a1[0]:.2f}, {a1[1]:.2f})、B1 ({b1[0]:.2f}, {b1[1]:.2f})、A18 x={a18[0]:.2f}")

    # ---- 機構: ブラケットと USB-C の口 --------------------------------------------
    mouths = {j: fpos[j][0] - 5.07 for j in ("J1", "J2")}
    for j in ("J1", "J2"):
        sig, sh = pos[(j, "A6")], pos[(j, "2")]
        ok(f"{j}: 口が左の辺を向く (信号のパッドが内側、前の殻の足が外側)。基板の端 (x=0) は原点から 4.08mm", sig[0] > sh[0]
           and abs(fpos[j][0] - 4.08) < 0.005, f"パッド x={sig[0]:.2f}、前の殻の足 x={sh[0]:.2f}、口の面 x={mouths[j]:.2f}")
    ok("J1 と J2 の口の面は同じ", abs(mouths["J1"] - mouths["J2"]) < 0.005)
    d1 = a1[0] - mouths["J1"]
    ok("USB-C の口の面 = ブラケットの外の面: 1 番ピンの中心から口の面まで 47.54mm (±0.05)", abs(d1 - 47.54) <= 0.05,
       f"{d1:.2f} mm (口の面 x={mouths['J1']:.2f}、1 番ピン x={a1[0]:.2f}。47.54 は推定の値)")
    br_in = mouths["J1"] + MB.BRACKET_T
    sy = fpos["J3"][1]
    edge = []
    for d in b.GetDrawings():
        if d.GetLayer() == pcbnew.Edge_Cuts:
            for p in (d.GetStart(), d.GetEnd()):
                edge.append((round(MM(p.x) - OX, 2), round(MM(p.y) - OY, 2)))
    stepped = (MB.STEP_X, MB.STEP_Y) in edge and (0.0, MB.STEP_Y) in edge
    left_low = min(x for x, y in edge if y > MB.STEP_Y + 0.5)
    ok("ブラケットをよける段: ブラケットが通る所で、基板の左の辺がブラケットの内の面から 0.5mm 以上引っ込んでいる",
       stepped and left_low - br_in >= 0.5 and left_low >= MB.STEP_X - 0.001,
       f"ブラケットの内の面 x={br_in:.2f}、基板の辺 x={left_low:.2f}、すきま {left_low - br_in:.2f} mm")
    ya, ya2 = sy - MB.BRACKET_A, sy - MB.BRACKET_A_MAX
    ok("ブラケットをよける段: 段の位置が、ブラケットの A 面の側の端より 0.5mm 以上手前 (張り出しを大きく読んだ 2.5mm でも)",
       ya2 - MB.STEP_Y >= 0.5,
       f"ブラケットの端 y={ya:.2f} (CEM 2.0 の図から 2.06mm) 〜 {ya2:.2f} (2.5mm と読んだとき)、段 y={MB.STEP_Y:.2f}、余裕 {ya - MB.STEP_Y:.2f} 〜 {ya2 - MB.STEP_Y:.2f} mm")
    by = [(x, y, n) for x, y, n, _d, _h in vias if x < 3.0 and abs(y - MB.STEP_Y) < 2.5]
    ok("段のそばのビアが、基板の端から 0.5mm 以上離れている",
       all((y <= MB.STEP_Y - 0.8) or (x >= MB.STEP_X + 0.8) for x, y, _n in by), " ".join(f"({x:.1f}, {y:.1f})" for x, y, _n in by) or "近くに無い")
    for j, (nm, wmin_) in (("J1", ("VBUS1", 0.8)), ("J2", ("VBUS2", 0.8))):
        g = cache.setdefault(nm, Net(b, nm))
        w = g.widest(f"{j}.A4B9", ("D1.1" if j == "J1" else "D2.1"))
        ok(f"{j}: VBUS の上のパッドから面までの線が、パッドの列を出たあと 0.9mm (パッドの上だけ 0.6mm)", w is not None, f"{w}")
    for j in ("J1", "J2"):
        ok(f"{j}: 殻 (幅 8.94mm) が段より上にある (ブラケットと重ならない)", fpos[j][1] + 4.47 <= MB.STEP_Y - 0.5,
           f"殻の下の端 y={fpos[j][1] + 4.47:.2f}")
    low = [r for r, fp in fps.items() if (lambda bb: MM(bb.GetLeft()) - OX < MB.STEP_X and MM(bb.GetBottom()) - OY > MB.STEP_Y)(fp.GetCourtyard(pcbnew.F_Cu).BBox())]
    ok("引っ込めた所 (x < 1.5、y > 44) に部品が無い", not low, " ".join(low) or "0 個")
    want = [(3.5, 3.5), (MB.W - 3.5, 3.5), (MB.STEP_X + 3.5, MB.H - 3.5), (MB.W - 3.5, MB.H - 3.5)]
    got = [fpos[h] for h in ("H1", "H2", "H3", "H4")]
    ok("取り付け穴 (M3、穴 3.2mm) が四隅にある", all(math.hypot(g[0] - w[0], g[1] - w[1]) < 0.01 for g, w in zip(got, want)),
       " ".join(f"({x:.1f}, {y:.1f})" for x, y in got))
    l3, l5 = fpos["LED3"], fpos["LED5"]
    ok("LED 2 個は同じ長い辺 (上 = カードのはんだ面の側) に並び、胴体の端が辺から 1mm 以内、間が 5mm 以上",
       abs(l3[1] - l5[1]) < 0.01 and l3[1] - 0.4 <= 1.0 and abs(l3[0] - l5[0]) >= 5.0,
       f"LED3 ({l3[0]:.1f}, {l3[1]:.1f})、LED5 ({l5[0]:.1f}, {l5[1]:.1f})。胴体の端は辺から {l3[1] - 0.4:.1f} mm")
    j4 = fpos["J4"]
    ok("J4 (内部 USB のヘッダ) は、カードのはんだ面の側で、カードの面から 8mm 以上離れている (ケーブルのプラグが当たらない)",
       sy - (j4[1] + 6.55) >= 6.0 and sy - j4[1] >= 8.0, f"ヘッダの中心からカードの面まで {sy - j4[1]:.1f} mm、ヘッダの端から {sy - j4[1] - 6.55:.1f} mm")

    # ---- そのほか ----------------------------------------------------------------
    shown = [fp.GetReference() for fp in b.GetFootprints()
             if fp.Reference().IsVisible() and fp.Reference().GetLayer() == pcbnew.F_SilkS]
    hidden = sorted(set(fps) - set(shown))
    ok("シルク: 部品番号が全部出ている", len(hidden) == 0, f"{len(shown)} 個。出ていない: {' '.join(hidden) or 'なし'}")
    thin = 0
    for fp in b.GetFootprints():
        for g in fp.GraphicalItems():
            if g.GetLayer() == pcbnew.F_SilkS and hasattr(g, "GetWidth") and 0 < MM(g.GetWidth()) < 0.149:
                thin += 1
    ok("シルク: 0.15mm より細い線が無い", thin == 0, f"{thin} 本")
    back = [r for r, fp in fps.items() if fp.GetLayer() != pcbnew.F_Cu]
    ok("部品は全部おもて面", not back, " ".join(back) or f"{len(fps)} 個")
    bb = b.GetBoardEdgesBoundingBox()
    ok(f"外形は {MB.W:.0f} x {MB.H:.0f}mm", abs(MM(bb.GetWidth()) - MB.W - 0.1) < 0.2 and abs(MM(bb.GetHeight()) - MB.H - 0.1) < 0.2,
       f"{MM(bb.GetWidth()) - 0.1:.1f} x {MM(bb.GetHeight()) - 0.1:.1f} mm (線の太さ 0.1mm を引いた値)")
    wmin = min(s[6] for s in segs)
    ok("いちばん細い線が 0.15mm 以上 (JLCPCB の最小は 0.10mm。手で引いた線は 0.2mm 以上で、"
       "0.15〜0.19mm は自動配線が IC のピンの所で幅をしぼった短い部分)", wmin >= 0.15 - 1e-6, f"{wmin:.3f} mm")
    vmin, dmin = min(v[3] for v in vias), min(v[4] for v in vias)
    ok("ビアは全部 外径 0.6mm・穴 0.3mm 以上", vmin >= 0.6 - 1e-6 and dmin >= 0.3 - 1e-6,
       f"{len(vias)} 個、外径 {vmin:.2f}・穴 {dmin:.2f} mm")
    out = ["# 基板の検査 (scripts/check_board.py が pcie-tuner-board.kicad_pcb を読んで作る)", ""] + rows
    out += ["", f"結果: {len(rows)} 項目中 OK {len(rows) - ng}、NG {ng}"]
    with open(os.path.join(ROOT, "out", "board_check.txt"), "w", encoding="utf-8", newline="\n") as fh:
        fh.write("\n".join(out) + "\n")
    print(out[-1])
    for r in rows:
        if r.startswith("[NG]"):
            print(r)
    return 1 if ng else 0


if __name__ == "__main__":
    sys.exit(main())
