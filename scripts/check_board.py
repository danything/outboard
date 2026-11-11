"""できあがった基板 (pcie-tuner-board.kicad_pcb) を、DRC とは別の目で検査する。

- 電源の道すじの「いちばん細い所」の幅 (線・パッド・ビアをたどって、端子から端子まで)
- USB の D+ と D- の長さの差
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

MM = pcbnew.ToMM


class Net:
    """1 本のネットの銅 (線・ビア・パッド) を節点にしたグラフ。"""

    def __init__(self, b, name):
        code = b.FindNet("/" + name).GetNetCode()
        self.nodes = []      # (種類, 層 or None, x1, y1, x2, y2, 幅, 名前)
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
        n = len(self.nodes)
        self.adj = [[] for _ in range(n)]
        for i in range(n):
            for j in range(i + 1, n):
                if self.touch(self.nodes[i], self.nodes[j]):
                    self.adj[i].append(j)
                    self.adj[j].append(i)

    @staticmethod
    def dseg(px, py, s):
        ax, ay, cx, cy = s[2], s[3], s[4], s[5]
        dx, dy = cx - ax, cy - ay
        L2 = dx * dx + dy * dy
        u = 0 if L2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L2))
        return math.hypot(px - (ax + u * dx), py - (ay + u * dy))

    def touch(self, a, b):
        if a[1] is not None and b[1] is not None and a[1] != b[1]:
            return False
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
        """src から dst までの道のうち、いちばん細い所がいちばん太い道。その細い所の幅を返す (パッドは数えない)。"""
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
                    cap = self.nodes[j][6] if self.nodes[j][0] != "pad" else 99.0
                    heapq.heappush(heap, (-min(w, cap), j))
        return None

    def shortest(self, src, dst):
        """src から dst までの、線の長さの合計がいちばん短い道の長さ。"""
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
                    nd = self.nodes[j]
                    L = math.hypot(nd[4] - nd[2], nd[5] - nd[3]) if nd[0] == "seg" else 0.0
                    heapq.heappush(heap, (d + L, j))
        return None


def main():
    b = pcbnew.LoadBoard(os.path.join(ROOT, "pcie-tuner-board.kicad_pcb"))
    rows = []
    ng = 0

    def ok(title, cond, detail=""):
        nonlocal ng
        rows.append(f"[{'OK' if cond else 'NG'}] {title}" + (f"\n       {detail}" if detail else ""))
        ng += 0 if cond else 1

    # ---- 電源の道すじの幅 ------------------------------------------------------
    paths = [
        ("VBUS1", "J1.B4A9", "D1.1", 0.6, "① の VBUS (上のパッド) -> D1。2 本に分かれるので 1 本あたり最大 1.9A"),
        ("VBUS1", "J1.A4B9", "D1.1", 0.6, "① の VBUS (下のパッド) -> D1"),
        ("VBUS2", "J2.B4A9", "D2.1", 0.6, "② の VBUS (上のパッド) -> D2"),
        ("VBUS2", "J2.A4B9", "D2.1", 0.6, "② の VBUS (下のパッド) -> D2"),
        ("VIN", "D1.2", "C9.1", 1.5, "VIN: D1 -> 降圧の入力コンデンサ"),
        ("VIN", "D2.2", "C9.1", 1.5, "VIN: D2 -> 降圧の入力コンデンサ"),
        ("VIN", "D1.2", "L2.1", 1.5, "VIN: D1 -> 昇圧のコイル"),
        ("+3V3_BUCK", "L1.2", "JP1.1", 1.5, "3.3V: コイル -> JP1"),
        ("+3V3", "JP1.2", "J3.A10", 1.5, "3.3V: JP1 -> スロット A10"),
        ("+3V3", "JP1.2", "J3.B8", 1.5, "3.3V: JP1 -> スロット B8"),
        ("+3V3", "J3.A10", "J3.A9", 0.8, "3.3V: A10 -> A9 (ピン 1 本ぶん、最大 1.1A)"),
        ("+12V_BOOST", "D4.1", "Q1.2", 0.8, "12V: D4 -> Q1"),
        ("+12V_SW", "Q1.3", "JP2.1", 0.8, "12V: Q1 -> JP2"),
        ("+12V", "JP2.2", "J3.B2", 0.8, "12V: JP2 -> スロット B2"),
        ("+12V", "JP2.2", "J3.A3", 0.8, "12V: JP2 -> スロット A3 (左の端を回る)"),
        ("+12V", "JP2.2", "J3.B3", 0.8, "12V: JP2 -> スロット B3"),
        ("+12V", "JP2.2", "J3.B1", 0.8, "12V: JP2 -> スロット B1"),
        ("+12V", "JP2.2", "J3.A2", 0.8, "12V: JP2 -> スロット A2"),
    ]
    cache = {}
    for net, a, c, need, title in paths:
        g = cache.setdefault(net, Net(b, net))
        w = g.widest(a, c)
        ok(f"{title}: いちばん細い所が {need}mm 以上", w is not None and w >= need - 1e-6,
           "つながっていない" if w is None else f"{w:.2f} mm")
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
    # ---- 向きと位置 ------------------------------------------------------------
    pos = {}
    for fp in b.GetFootprints():
        for pd in fp.Pads():
            p = pd.GetPosition()
            pos[(fp.GetReference(), pd.GetNumber())] = (MM(p.x) - OX, MM(p.y) - OY)
    a1, a18, b1 = pos[("J3", "A1")], pos[("J3", "A18")], pos[("J3", "B1")]
    ok("J3: 1 番ピンが左 (ブラケットの側)、18 番が右。A 面が上、B 面が下", a1[0] < a18[0] and a1[1] < b1[1]
       and abs(a1[0] - b1[0]) < 0.01, f"A1 ({a1[0]:.2f}, {a1[1]:.2f})、B1 ({b1[0]:.2f}, {b1[1]:.2f})、A18 x={a18[0]:.2f}")
    ok("J3: 1 番ピンから基板の左の端まで 10mm 以下 (カードのブラケットは基板の外に出る)", a1[0] <= 10.0, f"{a1[0]:.2f} mm")
    for j in ("J1", "J2"):
        sig, sh = pos[(j, "A6")], pos[(j, "2")]
        ok(f"{j}: 口が右の辺を向く (信号のパッドが内側、前の殻の足が外側)", sig[0] < sh[0] and sh[0] > 85,
           f"パッド x={sig[0]:.2f}、前の殻の足 x={sh[0]:.2f}、基板の端 x=90")
    ok("J1 と J2 は同じ辺 (右) に並ぶ", abs(pos[("J1", "A6")][0] - pos[("J2", "A6")][0]) < 0.01)
    back = [fp.GetReference() for fp in b.GetFootprints() if fp.GetLayer() != pcbnew.F_Cu]
    ok("部品は全部おもて面", not back, " ".join(back) or f"{len(b.GetFootprints())} 個")
    bb = b.GetBoardEdgesBoundingBox()
    ok("外形は 90 x 45mm", abs(MM(bb.GetWidth()) - 90.1) < 0.2 and abs(MM(bb.GetHeight()) - 45.1) < 0.2,
       f"{MM(bb.GetWidth()) - 0.1:.1f} x {MM(bb.GetHeight()) - 0.1:.1f} mm (線の太さ 0.1mm を引いた値)")
    # ---- 線とビアの大きさ ------------------------------------------------------
    wmin, vmin, dmin, nv, lb, lf = 99, 99, 99, 0, 0.0, 0.0
    for t in b.GetTracks():
        if t.Type() == pcbnew.PCB_VIA_T:
            nv += 1
            vmin = min(vmin, MM(t.GetWidth(pcbnew.F_Cu)))
            dmin = min(dmin, MM(t.GetDrill()))
        else:
            wmin = min(wmin, MM(t.GetWidth()))
            if t.GetLayer() == pcbnew.B_Cu:
                lb += MM(t.GetLength())
            else:
                lf += MM(t.GetLength())
    ok("いちばん細い線が 0.15mm 以上 (JLCPCB の最小は 0.10mm。手で引いた線は 0.2mm 以上で、"
       "0.15〜0.19mm は自動配線が IC のピンの所で幅をしぼった短い部分)", wmin >= 0.15 - 1e-6, f"{wmin:.3f} mm")
    ok("ビアは全部 外径 0.6mm・穴 0.3mm 以上", vmin >= 0.6 - 1e-6 and dmin >= 0.3 - 1e-6, f"{nv} 個、外径 {vmin:.2f}・穴 {dmin:.2f} mm")
    ok("配線の長さ (おもて / うら)", True, f"おもて {lf:.0f} mm、うら {lb:.0f} mm (うらは細い信号だけ。残りは GND のベタ)")
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
