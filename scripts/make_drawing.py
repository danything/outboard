"""寸法の図を作る: out/dimensions.pdf と out/dimensions.svg。

基板 (pcie-tuner-board.kicad_pcb) から部品の位置を読み、ブラケット・カード・USB-C の口の面・基板の端と、
その間の寸法を 1 枚に描く。左が全体 (1:1)、右がブラケットのまわりの拡大 (6 倍)。
図の中で (est) と付けた値は推定 (README の「寸法の根拠」)。実物で測って確かめる値。

使い方: "C:\\Program Files\\KiCad\\10.0\\bin\\python.exe" scripts/make_drawing.py
"""
from __future__ import annotations

import os
import subprocess
import sys

import pcbnew

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import make_board as MB  # noqa: E402
from board_lib import OX, OY, ROOT  # noqa: E402

KC = r"C:\Program Files\KiCad\10.0\bin\kicad-cli.exe"
L = pcbnew.Dwgs_User
MMI = pcbnew.FromMM
PAPER = (297, 170)


class Draw:
    def __init__(self):
        self.b = pcbnew.CreateEmptyBoard()
        self.ox, self.oy, self.s = 0.0, 0.0, 1.0

    def view(self, ox, oy, s):
        self.ox, self.oy, self.s = ox, oy, s

    def p(self, x, y):
        return pcbnew.VECTOR2I(MMI(self.ox + x * self.s), MMI(self.oy + y * self.s))

    def line(self, x1, y1, x2, y2, w=0.15):
        s = pcbnew.PCB_SHAPE(self.b)
        s.SetShape(pcbnew.SHAPE_T_SEGMENT)
        s.SetStart(self.p(x1, y1))
        s.SetEnd(self.p(x2, y2))
        s.SetLayer(L)
        s.SetWidth(MMI(w))
        self.b.Add(s)

    def poly(self, pts, w=0.15, close=True):
        q = list(pts) + ([pts[0]] if close else [])
        for a, c in zip(q, q[1:]):
            self.line(a[0], a[1], c[0], c[1], w)

    def rect(self, x1, y1, x2, y2, w=0.15, hatch=0.0):
        self.poly([(x1, y1), (x2, y1), (x2, y2), (x1, y2)], w)
        if hatch:
            y = y1 + hatch
            while y < y2:
                self.line(x1, y, x2, y, 0.05)
                y += hatch

    def circle(self, x, y, r, w=0.15):
        s = pcbnew.PCB_SHAPE(self.b)
        s.SetShape(pcbnew.SHAPE_T_CIRCLE)
        s.SetCenter(self.p(x, y))
        s.SetEnd(self.p(x + r, y))
        s.SetLayer(L)
        s.SetWidth(MMI(w))
        self.b.Add(s)

    def text(self, txt, x, y, size=1.6, rot=0, just="C", paper=False):
        t = pcbnew.PCB_TEXT(self.b)
        t.SetText(txt)
        t.SetPosition(pcbnew.VECTOR2I(MMI(x), MMI(y)) if paper else self.p(x, y))
        t.SetLayer(L)
        t.SetTextSize(pcbnew.VECTOR2I(MMI(size), MMI(size)))
        t.SetTextThickness(MMI(size * 0.13))
        t.SetTextAngleDegrees(rot)
        t.SetHorizJustify({"L": pcbnew.GR_TEXT_H_ALIGN_LEFT, "C": pcbnew.GR_TEXT_H_ALIGN_CENTER,
                           "R": pcbnew.GR_TEXT_H_ALIGN_RIGHT}[just])
        self.b.Add(t)

    def hdim(self, x1, x2, y, label, ext_from=None, size=1.5):
        """横の寸法線 (y の高さに引く)。ext_from: 引き出し線を始める y。"""
        self.line(x1, y, x2, y, 0.08)
        tk = 0.8 / self.s
        for x in (x1, x2):
            self.line(x, y - tk, x, y + tk, 0.08)
            if ext_from is not None:
                self.line(x, ext_from, x, y, 0.04)
        self.text(label, (x1 + x2) / 2, y - 1.6 / self.s, size)

    def vdim(self, y1, y2, x, label, ext_from=None, size=1.5, side=1):
        self.line(x, y1, x, y2, 0.08)
        tk = 0.8 / self.s
        for y in (y1, y2):
            self.line(x - tk, y, x + tk, y, 0.08)
            if ext_from is not None:
                self.line(ext_from, y, x, y, 0.04)
        self.text(label, x + side * 1.6 / self.s, (y1 + y2) / 2, size, rot=90)


def board_outline():
    W, H, sx, sy = MB.W, MB.H, MB.STEP_X, MB.STEP_Y
    return [(0, 0), (W, 0), (W, H), (sx, H), (sx, sy), (0, sy)]


def main():
    b = pcbnew.LoadBoard(os.path.join(ROOT, "pcie-tuner-board.kicad_pcb"))
    fp = {f.GetReference(): f for f in b.GetFootprints()}

    def at(ref):
        p = fp[ref].GetPosition()
        return pcbnew.ToMM(p.x) - OX, pcbnew.ToMM(p.y) - OY

    def pad(ref, num):
        for pd in fp[ref].Pads():
            if pd.GetNumber() == num:
                p = pd.GetPosition()
                return pcbnew.ToMM(p.x) - OX, pcbnew.ToMM(p.y) - OY

    def cy(ref):
        bb = fp[ref].GetCourtyard(pcbnew.F_Cu).BBox()
        return (pcbnew.ToMM(bb.GetLeft()) - OX, pcbnew.ToMM(bb.GetTop()) - OY, pcbnew.ToMM(bb.GetRight()) - OX,
                pcbnew.ToMM(bb.GetBottom()) - OY)

    W, H = MB.W, MB.H
    sx_, sy_ = at("J3")
    p1 = pad("J3", "A1")[0]
    mouth = at("J1")[0] - 5.07
    br_in = mouth + MB.BRACKET_T
    by1, by2 = sy_ - MB.BRACKET_A, sy_ + MB.BRACKET_B
    card_end = p1 - MB.CARD_END
    d = Draw()

    def common(detail):
        d.poly(board_outline(), 0.25)
        for j in ("J1", "J2"):
            jx, jy = at(j)
            d.rect(mouth, jy - 4.47, jx + 1.75, jy + 4.47, 0.12)
        d.rect(mouth, by1, br_in, by2, 0.12, hatch=0.0 if detail else 0.6)
        d.line(card_end, sy_ - 0.785, card_end, sy_ + 0.785, 0.12)

    # ================= 全体 (1:1) ================================================
    d.view(40.0, 42.0, 1.0)
    common(False)
    d.rect(*cy("J3"), 0.12)
    d.rect(*cy("J4"), 0.12)
    for ref in ("LED3", "LED5"):
        x, y = at(ref)
        d.rect(x - 0.8, y - 0.4, x + 0.8, y + 0.4, 0.12)
    for h in ("H1", "H2", "H3", "H4"):
        x, y = at(h)
        d.circle(x, y, 1.6, 0.12)
        d.line(x - 2.4, y, x + 2.4, y, 0.04)
        d.line(x, y - 2.4, x, y + 2.4, 0.04)
        d.text(f"{h} ({x:.1f}, {y:.1f})", x + (4.0 if x < 40 else -4.0), y + (3.4 if y < 30 else -3.4), 1.2,
               just="L" if x < 40 else "R")
    # カード (長さは公表の値が見つからないので、基板の右の端より先は破線の代わりに短い線で示す)
    for dy in (-0.785, 0.785):
        d.line(card_end, sy_ + dy, W + 14.0, sy_ + dy, 0.12)
    for k in range(4):
        d.line(W + 15.0 + 2.0 * k, sy_, W + 16.0 + 2.0 * k, sy_, 0.12)
    d.text("CARD: A (solder) side up, B (component) side down. Continues to the right - length not published, measure",
           W - 1.0, sy_ + 6.9, 1.1, just="R")
    d.line(p1, sy_ - 5.5, p1, sy_ + 5.5, 0.05)
    d.text("pin 1", p1, sy_ - 6.6, 1.2)
    d.text("J3 PCIe x1", sx_ + 3.0, sy_ - 0.2, 1.3)
    d.text("J4", at("J4")[0], at("J4")[1], 1.3)
    d.text("J2 (charger)", 9.5, at("J2")[1], 1.2, just="L")
    d.text("J1 (PC)", 9.5, at("J1")[1] - 6.0, 1.2, just="L")
    d.text("LED 3V3 / STAT", (at("LED3")[0] + at("LED5")[0]) / 2, 3.2, 1.2)
    d.text("BRACKET (est)", mouth - 1.5, (by1 + by2) / 2, 1.2, rot=90)
    # 寸法
    d.hdim(0.0, W, -7.0, f"{W:.1f}", ext_from=0.0)
    d.hdim(mouth, p1, -12.5, f"{p1 - mouth:.2f} (est)  USB-C mouth = bracket outer face  ->  pin 1", ext_from=0.0)
    d.hdim(0.0, at("LED3")[0], -2.5, f"{at('LED3')[0]:.1f}", size=1.1)
    d.hdim(at("LED3")[0], at("LED5")[0], -2.5, f"{at('LED5')[0] - at('LED3')[0]:.1f}", size=1.1)
    d.vdim(0.0, H, W + 8.0, f"{H:.1f}", ext_from=W)
    d.vdim(0.0, sy_, W + 3.5, f"{sy_:.1f}  slot centre", ext_from=W, size=1.2)
    d.vdim(0.0, at("J2")[1], -7.0, f"{at('J2')[1]:.1f}", ext_from=0.0, size=1.2, side=-1)
    d.vdim(0.0, at("J1")[1], -12.0, f"{at('J1')[1]:.1f}", ext_from=0.0, size=1.2, side=-1)
    d.vdim(0.0, MB.STEP_Y, -17.0, f"{MB.STEP_Y:.1f}  step", ext_from=0.0, size=1.2, side=-1)
    d.vdim(by1, by2, -22.0, f"{by2 - by1:.2f} (est)  bracket", ext_from=mouth, size=1.2, side=-1)
    d.hdim(MB.STEP_X, card_end, H + 5.0, "", ext_from=H)
    d.text(f"card PCB end x = {card_end:.2f} (pin 1 - {MB.CARD_END:.2f})", MB.STEP_X + 1.0, H + 8.0, 1.2, just="L")

    # ================= 拡大 (6 倍): ブラケットと USB-C の口と基板の端 ================
    S = 6.0
    yv1, yv2 = at("J1")[1] - 1.0, by1 + 6.0
    d.view(210.0 - (-2.6) * S, 30.0 - yv1 * S, S)
    x_r = 4.2

    def clip_poly(pts, w):
        for a, c in zip(pts, pts[1:]):
            d.line(a[0], min(max(a[1], yv1), yv2), c[0], min(max(c[1], yv1), yv2), w)

    clip_poly([(x_r, yv1), (0.0, yv1), (0.0, MB.STEP_Y), (MB.STEP_X, MB.STEP_Y), (MB.STEP_X, yv2), (x_r, yv2)], 0.3)
    jy = at("J1")[1]
    clip_poly([(x_r, jy + 4.47), (mouth, jy + 4.47), (mouth, yv1)], 0.15)
    clip_poly([(mouth, yv2), (mouth, by1), (br_in, by1), (br_in, yv2)], 0.15)
    y = by1 + 0.25
    while y < yv2:
        d.line(mouth, y, br_in, y, 0.04)
        y += 0.25
    d.line(mouth, yv1 - 1.5, mouth, yv2 + 0.5, 0.05)
    d.line(card_end, sy_ - 0.785, x_r, sy_ - 0.785, 0.12)
    d.line(card_end, sy_ + 0.785, x_r, sy_ + 0.785, 0.12)
    d.line(card_end, sy_ - 0.785, card_end, sy_ + 0.785, 0.12)
    d.text("USB-C J1", 2.3, jy + 3.2, 1.4)
    d.text("BOARD", 2.9, MB.STEP_Y - 1.6, 1.4)
    d.text("card PCB", 2.9, sy_ - 0.1, 1.2)
    d.text("bracket", mouth - 0.25, by1 + 3.2, 1.3, rot=90)
    d.hdim(mouth, 0.0, jy + 6.3, f"{0.0 - mouth:.2f}", ext_from=jy + 4.47, size=1.3)
    d.text("mouth beyond board edge", 0.4, jy + 6.9, 1.1, just="L")
    d.hdim(mouth, br_in, by1 - 0.7, f"{MB.BRACKET_T:.2f}", ext_from=by1, size=1.3)
    d.hdim(br_in, MB.STEP_X, by1 + 4.6, f"{MB.STEP_X - br_in:.2f}", ext_from=None, size=1.3)
    d.text("bracket inner face -> board edge", 0.3, by1 + 5.4, 1.1, just="L")
    d.vdim(MB.STEP_Y, by1, 3.3, f"{by1 - MB.STEP_Y:.2f} (est)", ext_from=None, size=1.2)
    d.line(MB.STEP_X, MB.STEP_Y, 3.3, MB.STEP_Y, 0.04)
    d.line(br_in, by1, 3.3, by1, 0.04)
    d.text("USB-C mouth face", mouth, yv1 - 2.6, 1.2)
    d.text("= bracket outer face (difference 0.00)", mouth, yv1 - 2.0, 1.2)

    # ================= 表題と注記 (紙の座標) ========================================
    d.text("PCIe tuner external power board  rev C  -  bracket / USB-C / board edge", 12.0, 12.0, 2.4, just="L", paper=True)
    d.text("top view, mm.  left: whole board 1:1.  right: detail x6.  origin (0, 0) = top-left corner of the board, x right, y down.",
           12.0, 17.0, 1.5, just="L", paper=True)
    notes = [
        "(est) = estimated value, to be measured on the real card and case before ordering:",
        f"  - pin 1 centre to bracket outer face {MB.PIN1_TO_BRACKET:.2f} (from a KiCad library built from PCIe CEM 1.2; CEM itself not read)",
        f"  - bracket plate {MB.BRACKET_T:.2f} thick, 18.42 wide: {MB.BRACKET_A:.2f} (up to {MB.BRACKET_A_MAX:.1f} by another reading) to the A side and {MB.BRACKET_B:.2f} to the B side",
        "    of the slot centre line (derived from PCIe CEM 2.0 figures 6-4 and 6-16)",
        f"  - the bracket tongue goes below the board top surface (about 11.8 standard / 7.7 low profile), so the edge is set back 1.5 mm for y >= {MB.STEP_Y:.0f}",
        "USB-C mouth 0.99 beyond the board edge: outline of the JLCPCB (EasyEDA) footprint of TYPE-C-31-M-12; board edge",
        "  is 5.79 from the rear shell legs (datasheet drawing). Case panel: inner face = bracket plate, so the mouth",
        f"  sticks {MB.BRACKET_T:.2f} into the panel hole when the bracket is {MB.BRACKET_T:.2f} thick.",
    ]
    for i, s in enumerate(notes):
        d.text(s, 12.0, 130.0 + 3.0 * i, 1.4, just="L", paper=True)
    tmp = os.path.join(ROOT, "build", "dimensions.kicad_pcb")
    pcbnew.SaveBoard(tmp, d.b, True)
    import re
    t = open(tmp, encoding="utf-8").read()
    t = re.sub(r'\(paper "[^"]*"[^)]*\)', '(paper "User" %d %d)' % PAPER, t, count=1)
    open(tmp, "w", encoding="utf-8", newline="\n").write(t)
    out = os.path.join(ROOT, "out")
    for fmt, extra in (("pdf", ["--mode-single"]), ("svg", ["--mode-single", "--page-size-mode", "0"])):
        r = subprocess.run([KC, "pcb", "export", fmt, "-l", "Dwgs.User", "--black-and-white", *extra,
                            "-o", os.path.join(out, "dimensions." + fmt), tmp], capture_output=True, text=True,
                           encoding="utf-8", errors="replace")
        if r.returncode:
            print(r.stdout, r.stderr)
            return 1
    print("wrote out/dimensions.pdf and out/dimensions.svg")
    return 0


if __name__ == "__main__":
    sys.exit(main())
