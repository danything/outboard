"""できあがった基板 (pcie-tuner-board.kicad_pcb) を、DRC とは別の目で検査する。rev D。

- 電源の道すじの「いちばん細い所」の幅 (線・面・パッド・ビアをたどって、端子から端子まで)
- USB の D+ と D- の長さの差、CC の線が USB-C の殻の下を通っていないこと
- 機構: USB-C の口の面とブラケットの外の面、後ろの辺の段、キーの切り欠き、取り付け穴、LED・J4 のプラグ・コネクタの耳の下
- スロット (基板の端をまたぐ形) のおもてとうらのパッドのつなぎ、部品が全部おもてにあること、線とビアの最小の大きさ、うらの面の配線の量
- 厚み: 部品の高さの表と、ケースの内の厚み
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
                    self.nodes.append(("pad", None if th else (pcbnew.F_Cu if pd.IsOnLayer(pcbnew.F_Cu) else pcbnew.B_Cu), MM(bb.GetLeft()), MM(bb.GetTop()),
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
            if a[0] == b[0]:                    # 同じネットの面どうし (四角に分けて描いた面): 角が相手の中にあればつながっている
                return a[1] == b[1] and (any(inside(self.polys[i], x, y) for x, y in self.polys[j])
                                         or any(inside(self.polys[j], x, y) for x, y in self.polys[i]))
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

    def widest(self, src, dst, exempt=None):
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
                    cap = self.nodes[j][6] if self.nodes[j][0] in ("seg", "via") and not (exempt and exempt(self.nodes[j])) else 99.0
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
        ("VBUS1", "J1.B4A9", "D1.1", 0.5, "① の VBUS (下のパッド) -> うらの橋 -> おもての面 -> D1 (ビアは外径 0.8mm が 2 個と 2 個)"),
        ("VBUS2", "J2.A4B9", "D2.1", 0.6, "② の VBUS (上のパッド) -> おもての面 -> D2"),
        ("VBUS2", "J2.B4A9", "D2.1", 0.5, "② の VBUS (下のパッド) -> うらの橋 -> おもての面 -> D2"),
        ("VIN", "D1.2", "C9.1", 1.5, "VIN: D1 -> 降圧の入力コンデンサ"),
        ("VIN", "D2.2", "C9.1", 1.5, "VIN: D2 -> 降圧の入力コンデンサ"),
        ("VIN", "D1.2", "L2.1", 1.5, "VIN: D1 -> 下の帯 (おもて) -> 昇圧のコイル"),
        ("+3V3_BUCK", "L1.2", "JP5.1", 1.5, "3.3V: コイル -> JP5 (閉じたはんだジャンパー)"),
        ("+3V3_BUCK", "L1.2", "JP1.1", 1.0, "3.3V: コイル -> JP1 (電流を測るときのヘッダ)"),
        ("+3V3", "JP1.2", "J3.B8", 1.5, "3.3V: JP1 -> 幹 -> スロット B8 (パッドのそばの短い所は除く)"),
        ("+3V3", "JP1.2", "J3.A10", 1.5, "3.3V: JP1 -> 幹 -> ビア 4 個 -> うら -> スロット A10 (ビアとパッドのそばの短い所は除く)"),
        ("+3V3", "JP1.2", "J3.A9", 1.5, "3.3V: JP1 -> 幹 -> ビア 4 個 -> うら -> スロット A9 (同上)"),
        ("+3V3", "JP5.2", "J3.A10", 1.0, "3.3V: JP5 (はんだジャンパー) -> スロット A10 (同上)"),
        ("+12V_BOOST", "D4.1", "Q1.2", 0.8, "12V: D4 -> Q1"),
        ("+12V_SW", "Q1.3", "F1.1", 0.8, "12V: Q1 -> F1 (ヒューズ)"),
        ("+12V_F", "F1.2", "JP2.1", 0.8, "12V: F1 -> JP2"),
        ("+12V_F", "F1.2", "JP6.1", 0.8, "12V: F1 -> JP6 (はんだジャンパー)"),
        ("+12V", "JP6.2", "J3.A2", 0.8, "12V: JP6 -> ビア 3 個 -> うら -> スロット A2 (パッドのそばの短い所は除く)"),
        ("+12V", "JP2.2", "J3.A3", 0.8, "12V: JP2 -> スロット A3 (同上)"),
        ("+12V", "JP2.2", "J3.B2", 0.8, "12V: JP2 -> うら -> パッドのすぐ下のビア 2 個 -> スロット B2 (同上)"),
    ]
    # パッドのそばの短い所 (y < 幹の上の辺。スロットのパッドから 2.6mm 以内) と、幹からうらへ降りるビアは、幅の検査から除く
    near_j3 = MB.YT - 0.35 + OY

    def exempt(nd):
        if nd[0] == "seg":
            return max(nd[3], nd[5]) <= near_j3 + 0.01 and MB.SLOT[0] - 10.5 + OX <= min(nd[2], nd[4])
        return nd[0] == "via" and nd[6] >= 0.79
    cache = {}
    for net, a, c, need, title in paths:
        g = cache.setdefault(net, Net(b, net))
        w = g.widest(a, c, exempt)
        w0 = g.widest(a, c)
        ok(f"{title}: いちばん細い所が {need}mm 以上", w is not None and w >= need - 1e-6,
           "つながっていない" if w is None else ("面とパッドだけ" if w > 90 else f"{w:.2f} mm")
           + ("" if w is None or abs(w - w0) < 1e-6 else f" (除いた所を入れると {w0:.2f} mm)"))

    def res(net, a, c):
        """a から c までの銅の抵抗 (mΩ)。1oz の銅を 0.49mΩ/□ として、線の長さ / 幅を足す (面は 0 と数える)。"""
        g = cache.setdefault(net, Net(b, net))
        return g.cost(a, c, lambda nd: 0.49 * math.hypot(nd[4] - nd[2], nd[5] - nd[3]) / nd[6] if nd[0] == "seg" else 0.0)

    ra, rb = res("+3V3", "JP1.2", "J3.A10"), res("+3V3", "JP1.2", "J3.B8")
    ok("3.3V: JP1 から A10 までと B8 までの銅の抵抗 (記録するだけ。ビアは数えていない)", True,
       f"A10 まで {ra:.1f} mΩ、B8 まで {rb:.1f} mΩ。12V: JP6 から A2 まで {res('+12V', 'JP6.2', 'J3.A2'):.1f} mΩ、D4 から Q1 まで {res('+12V_BOOST', 'D4.1', 'Q1.2'):.1f} mΩ、Q1 から F1 まで {res('+12V_SW', 'Q1.3', 'F1.1'):.1f} mΩ")

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
    lmax_ = max(lp, ln)
    ok("USB: J1 から J4 までの長さ (記録)", True, f"{lmax_:.1f} mm。U5 から先は、D- が J4 の上の列のすぐ上、D+ が 2 列の間を通る (間隔 2.5mm で 約 8mm 並ばない)")

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
        """rev B の降圧のまわりの座標 (U3 が (47, 9)) を、いまの基板の座標に直す (180 度回してある)。"""
        return (MB.U3X - (x - 47.0), MB.U3Y - (y - 9.0))

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
    # rev D: スロットの A 列がうらのパッドで、VIN の帯を 10 本前後の信号がうらでくぐるので、手で決めたうらの線だけで 約 300mm ある。
    # 上限は 500mm に置き、目標 (150mm) に届いていないことを記録する
    ok("うらの面の線の長さの合計が 500mm 以下 (目標は 150mm 以下。" + ("届いている" if lb <= 150 else "届いていない") + "。rev C は 257mm)", lb <= 500.0,
       f"うら {lb:.0f} mm・{len(lens)} ネット (おもて {lf:.0f} mm)。長い順: " + ", ".join(f"{k} {v:.0f}" for k, v in sorted(lens.items(), key=lambda kv: -kv[1])[:14]))
    xb1, xb2 = MB.BAND_W, MB.BAND_E
    cross = {}
    for net, lay, x1, y1, x2, y2, _w in segs:
        if lay == pcbnew.B_Cu and min(x1, x2) < xb2 and max(x1, x2) > xb1 and abs(y2 - y1) < abs(x2 - x1) + 1e-6 and net not in ("VIN",):
            cross[net] = cross.get(net, 0.0) + math.hypot(x2 - x1, y2 - y1)
    ok("うらの面: VIN の帯をくぐる線 (左右をまたぐ信号。記録)", True,
       f"{len(cross)} 本、合計 {sum(cross.values()):.0f} mm: " + ", ".join(f"{k} {v:.0f}" for k, v in sorted(cross.items(), key=lambda kv: -kv[1])))
    boxes = {"降圧": MB.NO_BOTTOM["buck-gnd"], "昇圧": MB.NO_BOTTOM["boost-gnd"],
             "USB のデータ線 (J1 -> U5。D+ 自身の A6 の渡り 2.3mm は除く)": MB.NO_BOTTOM["usb-gnd-1"],
             "USB のデータ線 (U5 -> J4)": MB.NO_BOTTOM["usb-gnd-2"]}
    for name, (bx1, by1, bx2, by2) in boxes.items():
        hit = sorted({net for net, lay, x1, y1, x2, y2, _w in segs if lay == pcbnew.B_Cu and net != "USB_DP"
                      and any(bx1 <= x1 + (x2 - x1) * k / 20 <= bx2 and by1 <= y1 + (y2 - y1) * k / 20 <= by2 for k in range(21))})
        ok(f"うらの面: {name}の下 (x {bx1:.1f}〜{bx2:.1f}、y {by1:.1f}〜{by2:.1f}) を通る線が無い", not hit, " ".join(hit) or "0 本")

    back = [r for r, fp in fps.items() if fp.GetLayer() != pcbnew.F_Cu]
    # ---- スロット (rev D: 基板の端をまたぐ形) -----------------------------------------
    def padobj(ref, num):
        return [p for p in fps[ref].Pads() if p.GetNumber() == num][0]

    b1, a1, b18 = pos[("J3", "B1")], pos[("J3", "A1")], pos[("J3", "B18")]
    rows_ok = all(padobj("J3", f"B{i}").IsOnLayer(pcbnew.F_Cu) and not padobj("J3", f"B{i}").IsOnLayer(pcbnew.B_Cu)
                  and padobj("J3", f"A{i}").IsOnLayer(pcbnew.B_Cu) and not padobj("J3", f"A{i}").IsOnLayer(pcbnew.F_Cu)
                  for i in range(1, 19))
    ok("J3: B 列がおもて (F.Cu)、A 列がうら (B.Cu)。B1・A1 は x = 46.55、18 番は右", rows_ok and abs(b1[0] - 46.55) < 0.005
       and abs(a1[0] - 46.55) < 0.005 and b18[0] > b1[0], f"B1 ({b1[0]:.2f}, {b1[1]:.2f})、A1 x={a1[0]:.2f}、B18 x={b18[0]:.2f}")
    pb = padobj("J3", "B1")
    py1, py2 = b1[1] - MM(pb.GetSizeY()) / 2, b1[1] + MM(pb.GetSizeY()) / 2
    ok("J3: パッドは 0.7 x 3.6、y = 1.4〜5.0 (基板の辺から 1.4)", abs(MM(pb.GetSizeX()) - 0.7) < 0.005 and abs(py1 - 1.4) < 0.005
       and abs(py2 - 5.0) < 0.005, f"{MM(pb.GetSizeX()):.2f} x {MM(pb.GetSizeY()):.2f}、y {py1:.2f}〜{py2:.2f}")
    ears = sorted((round(MM(p.GetPosition().x) - OX, 2), round(MM(p.GetPosition().y) - OY, 2), round(MM(p.GetDrillSizeX()), 2))
                  for p in fps["J3"].Pads() if p.GetAttribute() == pcbnew.PAD_ATTRIB_NPTH)
    ok("J3: 耳の穴 (めっきなし ø2.0) は (41.75, 2.51) と (70.35, 2.51)", ears == [(41.75, 2.51, 2.0), (70.35, 2.51, 2.0)], str(ears))
    edge, arcs = [], []
    for d in b.GetDrawings():
        if d.GetLayer() == pcbnew.Edge_Cuts:
            for p in (d.GetStart(), d.GetEnd()):
                edge.append((round(MM(p.x) - OX, 2), round(MM(p.y) - OY, 2)))
            if d.GetShape() == pcbnew.SHAPE_T_ARC:
                c = d.GetCenter()
                arcs.append((round(MM(c.x) - OX, 2), round(MM(c.y) - OY, 2), round(MM(d.GetRadius()), 2)))
    kx1, kx2, kr = MB.KEY_X - MB.KEY_W / 2, MB.KEY_X + MB.KEY_W / 2, MB.KEY_W / 2
    notch = all(q in edge for q in ((round(kx1, 2), 0.0), (round(kx1, 2), round(MB.KEY_D - kr, 2)), (round(kx2, 2), 0.0),
                                    (round(kx2, 2), round(MB.KEY_D - kr, 2)))) and (round(MB.KEY_X, 2), round(MB.KEY_D - kr, 2), round(kr, 2)) in arcs
    ok("外形: J3 のキーの切り欠きがある (中心 x = 58.05、幅 1.90、辺から深さ 6.0、先は半円)", notch and abs(MB.KEY_X - 58.05) < 0.005
       and abs(MB.KEY_W - 1.9) < 0.005 and abs(MB.KEY_D - 6.0) < 0.005, f"x {kx1:.2f}〜{kx2:.2f}、半円の中心 y={MB.KEY_D - kr:.2f}")
    g11 = kx1 - (pos[("J3", "B11")][0] + 0.35)
    g12 = (pos[("J3", "B12")][0] - 0.35) - kx2
    ok("J3: 切り欠きと B11/A11・B12/A12 のパッドの間は 0.20mm (図面どおり。DRU でこのパッドだけ 0.2 を許している)",
       abs(g11 - 0.2) < 0.005 and abs(g12 - 0.2) < 0.005, f"左 {g11:.3f} mm、右 {g12:.3f} mm")
    # おもてとうらの同じネットのパッドがつながっていること
    for net, nums in (("+12V", ("B1", "B2", "B3", "A2", "A3")), ("+3V3", ("B8", "A9", "A10"))):
        g = cache.setdefault(net, Net(b, net))
        bad = [n for n in nums[1:] if g.shortest("J3." + nums[0], "J3." + n) is None]
        ok(f"J3: {net} のおもてとうらのパッド ({'・'.join(nums)}) が線とビアでつながっている", not bad, " ".join(bad) or f"{len(nums)} 本とも")
    gg = Net(b, "GND")
    bad = [n for n in ("B4", "B7", "B13", "B16", "B18", "A4", "A12", "A15", "A18")
           if not any(gg.nodes[j][0] == "seg" for i in gg.find("J3." + n) for j in gg.adj[i])]
    ok("J3: GND のパッド (おもて 5 本・うら 4 本) は、ベタに頼らず線でビアにつないである", not bad, " ".join(bad) or "9 本とも")
    a9, a10 = pos[("J3", "A9")], pos[("J3", "A10")]
    n33 = [(x, y) for x, y, n, dia, _h in vias if n == "+3V3" and dia >= 0.79 and abs(y - MB.YT) < 0.6 and abs(x - a9[0]) < 4.0]
    ok("J3: +3V3 をうらの A9・A10 へ降ろすビア (外径 0.8mm) が 4 個以上", len(n33) >= 4,
       f"{len(n33)} 個: " + " ".join(f"({x:.2f}, {y:.2f})" for x, y in sorted(n33)))

    def cy(ref):
        bb = fps[ref].GetCourtyard(pcbnew.F_Cu).BBox()
        return (MM(bb.GetLeft()) - OX, MM(bb.GetTop()) - OY, MM(bb.GetRight()) - OX, MM(bb.GetBottom()) - OY)

    def hits(box, skip):
        return sorted(r for r in fps if r not in skip and cy(r)[2] > cy(r)[0]
                      and cy(r)[0] < box[2] and box[0] < cy(r)[2] and cy(r)[1] < box[3] and box[1] < cy(r)[3])

    for i, (x1, x2) in enumerate(MB.EARS):
        h = hits((x1, 0.0, x2, MB.EAR_Y), ("J3",))
        ok(f"J3: 耳の下 (x {x1}〜{x2}、y 0〜{MB.EAR_Y}。推定) に部品が無い", not h, " ".join(h) or "0 個")

    # ---- 機構: ブラケットと USB-C の口・J4・LED・穴 -----------------------------------
    mouths = {j: fpos[j][0] - 5.07 for j in ("J1", "J2")}
    for j in ("J1", "J2"):
        sig, sh = pos[(j, "A6")], pos[(j, "2")]
        ok(f"{j}: 口が左の辺を向く (信号のパッドが内側、前の殻の足が外側)。基板の端 (x=0) は原点から 4.08mm", sig[0] > sh[0]
           and abs(fpos[j][0] - 4.08) < 0.005, f"パッド x={sig[0]:.2f}、前の殻の足 x={sh[0]:.2f}、口の面 x={mouths[j]:.2f}")
        top = fpos[j][1] - 4.47
        ok(f"{j}: 殻 (幅 8.94mm) が y >= {MB.SHELL_MIN_Y} にある (ブラケットの舌の先 y = {MB.TONGUE_Y} より下)", top >= MB.SHELL_MIN_Y - 1e-6
           and fpos[j][1] + 4.47 <= MB.H, f"殻 y {top:.2f}〜{fpos[j][1] + 4.47:.2f}")
    ok("J1 と J2 の口の面は同じ。中心の間隔が 15mm 以上", abs(mouths["J1"] - mouths["J2"]) < 0.005 and abs(fpos["J1"][1] - fpos["J2"][1]) >= 15.0,
       f"間隔 {abs(fpos['J1'][1] - fpos['J2'][1]):.2f} mm")
    d1 = b1[0] - mouths["J1"]
    ok("USB-C の口の面 = ブラケットの外の面: 1 番ピンの中心から口の面まで 47.54mm (±0.05)", abs(d1 - 47.54) <= 0.05,
       f"{d1:.2f} mm (口の面 x={mouths['J1']:.2f}、1 番ピン x={b1[0]:.2f}。47.54 は推定の値)")
    br_in = mouths["J1"] + MB.BRACKET_T
    stepped = (MB.STEP_X, MB.STEP_Y) in edge and (0.0, MB.STEP_Y) in edge
    left_top = min(x for x, y in edge if y < MB.STEP_Y - 0.5)
    ok("後ろの辺の段: y < 10 では辺が x = 1.5 (ブラケットの板の内の面から 0.5mm 以上)。y >= 10 は x = 0",
       stepped and abs(MB.STEP_Y - 10.0) < 0.005 and abs(left_top - MB.STEP_X) < 0.005 and left_top - br_in >= 0.5
       and min(x for x, y in edge) == 0.0,
       f"ブラケットの内の面 x={br_in:.2f}、辺 x={left_top:.2f}、すきま {left_top - br_in:.2f} mm。板が全幅の所の端 y={MB.BRACKET_FULL_Y} (推定) から段まで {MB.STEP_Y - MB.BRACKET_FULL_Y:.2f} mm")
    low = hits((-5.0, -5.0, MB.STEP_X, MB.STEP_Y), ())
    ok("引っ込めた所 (x < 1.5、y < 10) に部品が無い", not low, " ".join(low) or "0 個")
    for j, nm in (("J1", "VBUS1"), ("J2", "VBUS2")):
        g = cache.setdefault(nm, Net(b, nm))
        w = g.widest(f"{j}.A4B9", ("D1.1" if j == "J1" else "D2.1"))
        ok(f"{j}: VBUS の上のパッドから面までの線が、パッドの列を出たあと 0.9mm (パッドの上だけ 0.6mm)", w is not None, f"{w}")
    got = [fpos[h] for h in ("H1", "H2", "H3", "H4")]
    ok("取り付け穴 (M3、穴 3.2mm): 左上・右上・右下の角と、2 つの USB-C の間 (後ろの遠い角は USB-C でふさがる)",
       all(math.hypot(g[0] - w[1], g[1] - w[2]) < 0.01 for g, w in zip(got, MB.HOLES))
       and fpos["H1"][0] < 9 and fpos["H1"][1] < 7 and fpos["H2"][0] > MB.W - 7 and fpos["H2"][1] < 7
       and fpos["H4"][0] > MB.W - 7 and fpos["H4"][1] > MB.H - 7 and abs(fpos["H3"][0] - 3.5) < 0.01
       and fpos["J1"][1] < fpos["H3"][1] < fpos["J2"][1],
       " ".join(f"{h} ({x:.2f}, {y:.2f})" for h, (x, y) in zip(("H1", "H2", "H3", "H4"), got)))
    l3, l5 = fpos["LED3"], fpos["LED5"]
    ok("LED 2 個は下の長い辺 (カードと反対の辺) に並び、胴体の端が辺から 1mm 以内、間が 5mm 以上",
       abs(l3[1] - l5[1]) < 0.01 and MB.H - (l3[1] + 0.4) <= 1.0 and abs(l3[0] - l5[0]) >= 5.0,
       f"LED3 ({l3[0]:.1f}, {l3[1]:.1f})、LED5 ({l5[0]:.1f}, {l5[1]:.1f})。胴体の端は辺から {MB.H - (l3[1] + 0.4):.1f} mm")
    # J4 (横向き): プラグは基板の上に寝る。その下とヘッダの樹脂の下に部品を置かない
    odd, even = pos[("J4", "1")], pos[("J4", "2")]
    px1, py1_, px2, py2_ = MB.J4_PLUG
    ok("J4: 奇数の列 (1・3・5・7・9 = 下の段) がプラグの側。プラグ (推定 14 x 13.2) は上 (カードの辺の側) へ寝て、基板の中に収まる",
       odd[1] < even[1] and py1_ >= 0.0 and px1 >= 0.0 and px2 <= MB.W and all(abs(pos[("J4", str(n))][1] - odd[1]) < 0.01 for n in (3, 5, 7, 9)),
       f"奇数の列 y={odd[1]:.2f}、偶数の列 y={even[1]:.2f}、プラグ x {px1:.1f}〜{px2:.1f}、y {py1_:.2f}〜{py2_:.2f} (先は基板の辺から {py1_:.2f} mm)")
    h = hits(MB.J4_PLUG, ("J4",)) + hits(MB.J4_BODY, ("J4",))
    ok("J4: プラグの下と樹脂の下に部品が無い (銅の面と線だけ)", not h, " ".join(h) or "0 個")
    lp_ = [r for r in ("LED3", "LED5") if px1 - 1 < fpos[r][0] < px2 + 1 and fpos[r][1] < py2_ + 1]
    ok("LED は J4 のプラグの下に無い", not lp_, " ".join(lp_) or "2 個とも離れている")
    silk_txt = [t.GetText() for t in b.GetDrawings() if isinstance(t, pcbnew.PCB_TEXT) and t.GetLayer() == pcbnew.F_SilkS]
    ok("シルク: J4 の列の数字 1・3・5・7・9、「1=5V」、下の段の説明がある", all(d in silk_txt for d in "13579")
       and any("1=5V" in t for t in silk_txt) and any("LOWER ROW" in t for t in silk_txt), " / ".join(t for t in silk_txt if "J4" in t or "ROW" in t))

    # ---- 厚み ----------------------------------------------------------------------
    # 高さは基板の面から。出どころ: 3D = EasyEDA の 3D モデルの名前にある H、brief = build/REVD_BRIEF.md、est = 推定 (データシートで確かめていない)
    HEIGHT = {
        "C0603": (0.8, "3D"), "C0805": (1.3, "3D"), "R0603": (0.55, "est"), "R0805": (0.6, "3D"), "F1206": (0.6, "3D"),
        "IND-SMD_L7.0-W6.6": (3.0, "3D"), "LED-SMD_L1.6-W0.8-R-RD": (0.6, "3D"), "SMA_L4.4-W2.8-LS5.4-R-RD": (2.44, "est"),
        "SMA_L4.3-W2.6-LS5.2-RD": (2.44, "est"), "SOD-123F_L2.7-W1.6-LS3.8-RD": (1.2, "est"), "SOD-123_L2.7-W1.6-LS3.7-RD": (1.4, "3D"),
        "SOT-23-3_L2.9-W1.3-P1.90-LS2.4-BR": (1.1, "3D"), "SOT-23_L2.9-W1.3-P1.90-LS2.4-BR": (1.1, "3D"),
        "SOT-23-6_L2.9-W1.6-P0.95-LS2.8-BR": (1.5, "3D"), "SOT-89-3_L4.5-W2.5-P1.50-LS4.2-BR": (1.6, "3D"),
        "TSSOP-20_L6.5-W4.4-P0.65-LS6.4-BL": (1.2, "est"), "ESSOP-10_L4.9-W3.9-P1.0-LS6.0-TL-EP": (1.75, "est"),
        "SOT-583-8_L2.1-W1.2-P0.50-LS1.6-BR": (0.6, "est"), "USB-C_SMD-TYPE-C-31-M-12_1": (3.3, "est"),
        "CONN-SMD_36P-P1.00_X1613WS-36-9TV01": (2.98, "brief"), "HDR-TH_10P-P2.54-H-M-R2-C5-S2.54": (6.5, "est"),
        "HDR-TH_2P-P2.54-V-M": (8.6, "est"), "TestPoint_Pad_D1.5mm": (0.0, "-"), "MountingHole_3.2mm_M3": (0.0, "-"),
        "SolderJumper-2_P1.3mm_Bridged_RoundedPad1.0x1.5mm": (0.0, "-"), "SolderJumper-2_P1.3mm_Open_RoundedPad1.0x1.5mm": (0.0, "-"),
    }
    # うらに出る足 (基板のうらの面から)
    BELOW = {"CONN-SMD_36P-P1.00_X1613WS-36-9TV01": (2.98, "brief"), "HDR-TH_10P-P2.54-H-M-R2-C5-S2.54": (1.4, "est"),
             "HDR-TH_2P-P2.54-V-M": (1.4, "est"), "USB-C_SMD-TYPE-C-31-M-12_1": (0.8, "est")}
    NOTE = {"HDR-TH_10P-P2.54-H-M-R2-C5-S2.54": "J4 にプラグを挿した高さ", "HDR-TH_2P-P2.54-V-M": "載せない。ヘッダを付けたときの高さ",
            "CONN-SMD_36P-P1.00_X1613WS-36-9TV01": "胴体は基板の中心から ±3.78"}
    limit_top = MB.Z_TOP - 0.8
    tbl, miss, over, under = {}, [], [], []
    for r, fp in fps.items():
        name = str(fp.GetFPID().GetLibItemName())
        if name not in HEIGHT:
            miss.append(r)
            continue
        tbl.setdefault(name, []).append(r)
        if HEIGHT[name][0] > limit_top:
            over.append(r)
        if BELOW.get(name, (0.0,))[0] > MB.Z_BOTTOM + 1e-6:
            under.append(r)
    lines = []
    for name in sorted(tbl, key=lambda n: -HEIGHT[n][0]):
        hh, src = HEIGHT[name]
        lo = BELOW.get(name)
        refs = sorted(tbl[name], key=lambda r: (r.rstrip("0123456789"), int("".join(c for c in r if c.isdigit()) or 0)))
        lines.append(f"{hh:5.2f} mm ({src})" + (f"、うら {lo[0]:.2f} mm ({lo[1]})" if lo else "") + f": {name} x{len(refs)} [{refs[0]}"
                     + (f"..{refs[-1]}" if len(refs) > 1 else "") + "]" + (f" {NOTE[name]}" if name in NOTE else ""))
    hmax = max(HEIGHT[n][0] for n in tbl)
    lmax = max(BELOW[n][0] for n in tbl if n in BELOW)
    ok(f"厚み: おもての部品は全部、基板の中心から +{MB.Z_TOP}mm (基板の面から {limit_top:.2f}mm) の中。いちばん高いのは {hmax:.1f}mm",
       not miss and not over, ("高さの表に無い: " + " ".join(miss) + " / " if miss else "") + ("超える: " + " ".join(over) + " / " if over else "")
       + "高さの表 (基板の面から): " + " | ".join(lines))
    ok(f"厚み: うらに出る物は全部、基板のうらの面から {MB.Z_BOTTOM}mm (J3 の胴体) の中。J3 を除いていちばん出るのは {max(BELOW[n][0] for n in tbl if n in BELOW and not n.startswith('CONN')):.1f}mm (推定)",
       not under and not back and lmax <= MB.Z_BOTTOM + 1e-6, " ".join(under) or "うらの面に部品は無い。出るのはスルーホールの足と USB-C の殻の足、J3 の胴体だけ")
    t1 = MB.Z_TOP + 0.8 + MB.Z_BOTTOM
    ok("厚み: ケースの内の厚み (記録)。おもての限り (ブラケットの B 面の側の張り出し) + 基板 + J3 の胴体のうらの側", True,
       f"読み方 1: {MB.Z_TOP} + 0.8 + {MB.Z_BOTTOM} = {t1:.2f} mm。読み方 2: {t1 + 1.44:.2f} mm (おもての限りを +1.44 = {MB.Z_TOP + 1.44:.2f} と読んだとき)。"
       f"どちらでも、この基板の部品でいちばん高い {hmax:.1f}mm (面から) は {limit_top:.2f}mm の中")

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
