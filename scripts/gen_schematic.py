"""回路図 (pcie-tuner-board.kicad_sch) とシンボルライブラリ (lib/pcie-tuner.kicad_sym) を作る。

- 回路の中身 (部品・値・LCSC の品番・ピンごとのネット) は、このファイルが唯一の出どころ。
- 配線はネットラベルで行う。部品は機能ごとの枠にまとめ、2 端子の部品は
  「左のネット ─[部品]─ 右のネット」の行として並べる。
- 出力は KiCad 9 の書式 (20250114)。あとで `kicad-cli sch upgrade` で手元の版の書式に直す。

使い方: python scripts/gen_schematic.py   (リポジトリの根で。KiCad の python でも普通の python でもよい)
"""
from __future__ import annotations

import math
import os
import sys
import uuid

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from parts import FP, PARTS  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJECT = "pcie-tuner-board"
LIB = "pcie-tuner"
NS = uuid.UUID("6a1f3c52-9b7e-4c0d-8d55-70636965746e")
ROOT_UUID = str(uuid.uuid5(NS, "root-sheet"))


def uid(*k) -> str:
    return str(uuid.uuid5(NS, "/".join(str(x) for x in k)))


def q(s: str) -> str:
    return '"' + str(s).replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n") + '"'


def f(x: float) -> str:
    s = f"{x:.4f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


FONT = "(effects (font (size 1.27 1.27)))"
FONT_HIDE = "(effects (font (size 1.27 1.27)) (hide yes))"

# ---------------------------------------------------------------------------
# シンボルの定義
# ---------------------------------------------------------------------------
# 箱形のシンボル: left / right に (番号, 名前, 電気的な型) を上から順に並べる。None は 1 段あける。
IN, OUT, BI, PAS, PWI, PWO, OC, NC = (
    "input", "output", "bidirectional", "passive", "power_in", "power_out", "open_collector", "no_connect")

BOX = {
    "CH224A": dict(prefix="U", desc="USB PD sink controller (WCH CH224A, ESSOP10)",
                   left=[("1", "VHV", PWI), ("8", "VBUS", IN), None, ("7", "CC1", BI), ("6", "CC2", BI), None,
                         ("4", "DP", PAS), ("5", "DM", PAS)],
                   right=[("10", "PG", OC), None, ("9", "CFG1", PAS), ("2", "CFG2/SCL", IN), ("3", "CFG3/SDA", BI),
                          None, None, ("11", "GND(EP)", PWI)]),
    "TPS62933": dict(prefix="U", desc="3A buck converter (TI TPS62933DRLR, SOT583)",
                     left=[("3", "VIN", PWI), ("2", "EN", IN), ("1", "RT", PAS), ("7", "SS", PAS), ("4", "GND", PWI)],
                     right=[("6", "BST", PAS), ("5", "SW", OUT), None, ("8", "FB", IN)]),
    "MT3608B": dict(prefix="U", desc="Boost converter (Aerosemi MT3608B, SOT23-6)",
                    left=[("5", "VIN", PWI), ("4", "EN", IN), None, ("2", "GND", PWI)],
                    right=[("1", "SW", PAS), ("3", "FB", IN), None, ("6", "NC", NC)]),
    "SRV05-4": dict(prefix="U", desc="ESD protection array (ProTek SRV05-4, SOT23-6)",
                    left=[("1", "IO1", PAS), ("3", "IO2", PAS), None, ("2", "GND", PAS)],
                    right=[("6", "IO4", PAS), ("4", "IO3", PAS), None, ("5", "REF", PAS)]),
    "HT7550-1": dict(prefix="U", desc="5V 100mA LDO (Holtek HT7550-1, SOT-89)",
                     left=[("2", "VIN", PWI), None, ("1", "GND", PWI)],
                     right=[("3", "VOUT", PWO)]),
    "CH32V003F4P6": dict(prefix="U", desc="RISC-V MCU (WCH CH32V003F4P6, TSSOP20)",
                         left=[("9", "VDD", PWI), None, ("1", "PD4/A7", BI), ("2", "PD5/A5", BI), ("3", "PD6/A6", BI),
                               ("5", "PA1/A1", BI), ("6", "PA2/A0", BI), ("19", "PD2/A3", BI), ("20", "PD3/A4", BI),
                               ("4", "PD7/NRST", BI), None, ("7", "VSS", PWI)],
                         right=[("10", "PC0", BI), ("11", "PC1/SDA", BI), ("12", "PC2/SCL", BI), ("13", "PC3", BI),
                                ("14", "PC4", BI), ("15", "PC5/SCL_2", BI), ("16", "PC6/SDA_2", BI), ("17", "PC7", BI),
                                None, ("8", "PD0", BI), ("18", "PD1/SWIO", BI)]),
    "PMOS_GSD": dict(prefix="Q", desc="P-channel MOSFET, SOT-23 (1=G 2=S 3=D)",
                     left=[("1", "G", PAS)], right=[("2", "S", PAS), ("3", "D", PAS)]),
    "NMOS_GSD": dict(prefix="Q", desc="N-channel MOSFET, SOT-23 (1=G 2=S 3=D)",
                     left=[("1", "G", PAS)], right=[("3", "D", PAS), ("2", "S", PAS)]),
    "USB_C_16P": dict(prefix="J", desc="USB Type-C receptacle, 16 pin (HRO TYPE-C-31-M-12)",
                      left=[],
                      right=[("A4B9", "VBUS", PAS), ("B4A9", "VBUS", PAS), None, ("A5", "CC1", PAS), ("B5", "CC2", PAS),
                             None, ("A6", "DP1", PAS), ("B6", "DP2", PAS), ("A7", "DN1", PAS), ("B7", "DN2", PAS), None,
                             ("A8", "SBU1", PAS), ("B8", "SBU2", PAS), None, ("A1B12", "GND", PAS),
                             ("B1A12", "GND", PAS), None, ("1", "SHELL", PAS), ("2", "SHELL", PAS), ("3", "SHELL", PAS),
                             ("4", "SHELL", PAS)]),
    "PCIE_X1": dict(prefix="J", desc="PCI Express x1 card edge socket, 36 pin (UMAX 3183-10200P1T)",
                    left=[("A1", "PRSNT1#", PAS), ("A2", "+12V", PAS), ("A3", "+12V", PAS), ("A4", "GND", PAS),
                          ("A5", "JTAG2(TCK)", PAS), ("A6", "JTAG3(TDI)", PAS), ("A7", "JTAG4(TDO)", PAS),
                          ("A8", "JTAG5(TMS)", PAS), ("A9", "+3.3V", PAS), ("A10", "+3.3V", PAS),
                          ("A11", "PERST#", PAS), None, ("A12", "GND", PAS), ("A13", "REFCLK+", PAS),
                          ("A14", "REFCLK-", PAS), ("A15", "GND", PAS), ("A16", "PERp0", PAS), ("A17", "PERn0", PAS),
                          ("A18", "GND", PAS)],
                    right=[("B1", "+12V", PAS), ("B2", "+12V", PAS), ("B3", "+12V", PAS), ("B4", "GND", PAS),
                           ("B5", "SMCLK", PAS), ("B6", "SMDAT", PAS), ("B7", "GND", PAS), ("B8", "+3.3V", PAS),
                           ("B9", "JTAG1(TRST#)", PAS), ("B10", "3.3Vaux", PAS), ("B11", "WAKE#", PAS), None,
                           ("B12", "RSVD", PAS), ("B13", "GND", PAS), ("B14", "PETp0", PAS), ("B15", "PETn0", PAS),
                           ("B16", "GND", PAS), ("B17", "PRSNT2#", PAS), ("B18", "GND", PAS)]),
    "HDR_2x5": dict(prefix="J", desc="Pin header 2x5, 2.54mm (internal USB 2.0 header pinout)",
                    left=[("1", "VBUS", PAS), ("3", "D-", PAS), ("5", "D+", PAS), ("7", "GND", PAS), ("9", "KEY", PAS)],
                    right=[("2", "VBUS2", PAS), ("4", "D2-", PAS), ("6", "D2+", PAS), ("8", "GND2", PAS),
                           ("10", "NC", PAS)]),
    "HDR_1x2": dict(prefix="J", desc="Pin header 1x2, 2.54mm", left=[("1", "1", PAS)], right=[("2", "2", PAS)]),
    "SW_SPDT": dict(prefix="SW", desc="Slide switch SPDT (SHOU HAN MSK12C02)",
                    left=[("2", "COM", PAS)], right=[("1", "A", PAS), ("3", "B", PAS), ("4", "SHELL", PAS)]),
}

# 2 端子の部品 (横向き。左がピン L、右がピン R)。pins = (左の番号, 右の番号)
TWO = {
    "R": dict(prefix="R", desc="Resistor", pins=("1", "2"), glyph="R"),
    "C": dict(prefix="C", desc="Capacitor (MLCC)", pins=("1", "2"), glyph="C"),
    "L": dict(prefix="L", desc="Inductor", pins=("1", "2"), glyph="L"),
    "F": dict(prefix="F", desc="Resettable fuse (PTC)", pins=("1", "2"), glyph="R"),
    # ダイオードは左がアノード、右がカソード。フットプリントのパッド番号の付き方で 2 種類。
    "D_A1K2": dict(prefix="D", desc="Diode (pad 1 = anode, pad 2 = cathode)", pins=("1", "2"), glyph="D"),
    "D_K1A2": dict(prefix="D", desc="Diode (pad 1 = cathode, pad 2 = anode)", pins=("2", "1"), glyph="D"),
    "LED_A1K2": dict(prefix="LED", desc="LED (pad 1 = anode, pad 2 = cathode)", pins=("1", "2"), glyph="LED"),
    "LED_K1A2": dict(prefix="LED", desc="LED (pad 1 = cathode, pad 2 = anode)", pins=("2", "1"), glyph="LED"),
    "JP_SOLDER": dict(prefix="JP", desc="Solder jumper, 2 pads, bridged by default (cut to open)", pins=("1", "2"),
                      glyph="JP"),
}


def box_geometry(name):
    d = BOX[name]
    n = max(len(d["left"]), len(d["right"]), 1)
    ll = max([len(p[1]) for p in d["left"] if p] or [0])
    lr = max([len(p[1]) for p in d["right"] if p] or [0])
    w = max(10.16, math.ceil(((ll + lr) * 1.15 + 5.0) / 5.08) * 5.08)
    top = 2.54 * ((n - 1) // 2)
    pins = {}
    for side, lst in (("L", d["left"]), ("R", d["right"])):
        for i, p in enumerate(lst):
            if not p:
                continue
            y = top - i * 2.54
            x = -(w / 2 + 2.54) if side == "L" else (w / 2 + 2.54)
            pins[p[0]] = (x, y, side, p[1], p[2])
    return w, top, n, pins


def sym_props(prefix, value, desc):
    return (f'(property "Reference" {q(prefix)} (at 0 0 0) {FONT})\n'
            f'(property "Value" {q(value)} (at 0 0 0) {FONT})\n'
            f'(property "Footprint" "" (at 0 0 0) {FONT_HIDE})\n'
            f'(property "Datasheet" "" (at 0 0 0) {FONT_HIDE})\n'
            f'(property "Description" {q(desc)} (at 0 0 0) {FONT_HIDE})\n')


def box_symbol(name, libprefix=""):
    d = BOX[name]
    w, top, n, pins = box_geometry(name)
    bot = top - (n - 1) * 2.54
    out = [f'(symbol {q(libprefix + name)} (pin_names (offset 0.762)) (exclude_from_sim no) (in_bom yes) (on_board yes)\n',
           sym_props(d["prefix"], name, d["desc"]),
           f'(symbol {q(name + "_0_1")} (rectangle (start {f(-w / 2)} {f(top + 2.54)}) (end {f(w / 2)} {f(bot - 2.54)}) '
           f'(stroke (width 0.254) (type default)) (fill (type background))))\n',
           f'(symbol {q(name + "_1_1")}\n']
    for num, (x, y, side, pname, et) in pins.items():
        ang = 0 if side == "L" else 180
        out.append(f'(pin {et} line (at {f(x)} {f(y)} {ang}) (length 2.54) (name {q(pname)} {FONT}) '
                   f'(number {q(num)} {FONT}))\n')
    out.append("))\n")
    return "".join(out)


def glyph(kind):
    st = "(stroke (width 0.254) (type default)) (fill (type none))"
    if kind == "R":
        return f"(rectangle (start -2.54 1.016) (end 2.54 -1.016) {st})"
    if kind == "C":
        return (f"(polyline (pts (xy -0.635 1.905) (xy -0.635 -1.905)) {st})"
                f"(polyline (pts (xy 0.635 1.905) (xy 0.635 -1.905)) {st})"
                f"(polyline (pts (xy -2.54 0) (xy -0.635 0)) {st})(polyline (pts (xy 0.635 0) (xy 2.54 0)) {st})")
    if kind == "L":
        return "".join(f"(arc (start {f(x0)} 0) (mid {f(x0 + 0.635)} 0.635) (end {f(x0 + 1.27)} 0) {st})"
                       for x0 in (-2.54, -1.27, 0, 1.27))
    if kind in ("D", "LED"):
        s = (f"(polyline (pts (xy -1.27 1.27) (xy -1.27 -1.27) (xy 1.27 0) (xy -1.27 1.27)) {st})"
             f"(polyline (pts (xy 1.27 1.27) (xy 1.27 -1.27)) {st})"
             f"(polyline (pts (xy -2.54 0) (xy -1.27 0)) {st})(polyline (pts (xy 1.27 0) (xy 2.54 0)) {st})")
        if kind == "LED":
            s += (f"(polyline (pts (xy 0 2.032) (xy 1.016 3.048)) {st})"
                  f"(polyline (pts (xy 1.27 1.778) (xy 2.286 2.794)) {st})")
        return s
    if kind == "JP":
        return (f"(arc (start -1.016 1.016) (mid -2.032 0) (end -1.016 -1.016) {st})"
                f"(polyline (pts (xy -1.016 1.016) (xy -1.016 -1.016)) {st})"
                f"(arc (start 1.016 -1.016) (mid 2.032 0) (end 1.016 1.016) {st})"
                f"(polyline (pts (xy 1.016 1.016) (xy 1.016 -1.016)) {st})"
                f"(polyline (pts (xy -1.016 0) (xy 1.016 0)) {st})"
                f"(polyline (pts (xy -2.54 0) (xy -2.032 0)) {st})(polyline (pts (xy 2.032 0) (xy 2.54 0)) {st})")
    raise ValueError(kind)


def two_symbol(name, libprefix=""):
    d = TWO[name]
    a, b = d["pins"]
    nl, nr = ("A", "K") if d["glyph"] in ("D", "LED") else ("1", "2")
    return (f'(symbol {q(libprefix + name)} (pin_numbers (hide yes)) (pin_names (offset 0) (hide yes)) '
            f'(exclude_from_sim no) (in_bom yes) (on_board yes)\n'
            + sym_props(d["prefix"], name, d["desc"])
            + f'(symbol {q(name + "_0_1")} {glyph(d["glyph"])})\n'
            + f'(symbol {q(name + "_1_1")}\n'
            + f'(pin passive line (at -3.81 0 0) (length 1.27) (name {q(nl)} {FONT}) (number {q(a)} {FONT}))\n'
            + f'(pin passive line (at 3.81 0 180) (length 1.27) (name {q(nr)} {FONT}) (number {q(b)} {FONT}))\n'
            + "))\n")


def misc_symbols(libprefix=""):
    st = "(stroke (width 0.254) (type default)) (fill (type none))"
    tp = (f'(symbol {q(libprefix + "TestPoint")} (pin_numbers (hide yes)) (pin_names (offset 0) (hide yes)) '
          f'(exclude_from_sim no) (in_bom no) (on_board yes)\n'
          + sym_props("TP", "TestPoint", "Test point (bare pad, not assembled)")
          + f'(symbol "TestPoint_0_1" (circle (center 1.27 0) (radius 0.762) {st}))\n'
          + f'(symbol "TestPoint_1_1" (pin passive line (at -2.54 0 0) (length 3.048) (name "1" {FONT}) '
            f'(number "1" {FONT})))\n)\n')
    mh = (f'(symbol {q(libprefix + "MountingHole")} (exclude_from_sim no) (in_bom no) (on_board yes)\n'
          + sym_props("H", "MountingHole", "Mounting hole M3 (no electrical connection)")
          + f'(symbol "MountingHole_0_1" (circle (center 0 0) (radius 1.27) {st}) (circle (center 0 0) (radius 0.508) {st}))\n)\n')
    fl = (f'(symbol {q(libprefix + "PWR_FLAG")} (power) (pin_numbers (hide yes)) (pin_names (offset 0) (hide yes)) '
          f'(exclude_from_sim no) (in_bom no) (on_board no)\n'
          + f'(property "Reference" "#FLG" (at 0 0 0) {FONT_HIDE})\n'
          + f'(property "Value" "PWR_FLAG" (at 0 0 0) {FONT})\n'
          + f'(property "Footprint" "" (at 0 0 0) {FONT_HIDE})\n(property "Datasheet" "" (at 0 0 0) {FONT_HIDE})\n'
          + f'(property "Description" "ERC power flag: this net is powered from outside the IC pins" (at 0 0 0) {FONT_HIDE})\n'
          + f'(symbol "PWR_FLAG_0_1" (polyline (pts (xy 0 0) (xy 1.27 0) (xy 2.54 1.27) (xy 3.81 0) (xy 2.54 -1.27) (xy 1.27 0)) {st}))\n'
          + f'(symbol "PWR_FLAG_1_1" (pin power_out line (at 0 0 0) (length 0) (name "pwr" {FONT}) (number "1" {FONT})))\n)\n')
    return tp + mh + fl


def all_symbols(libprefix=""):
    s = "".join(box_symbol(n, libprefix) for n in BOX)
    s += "".join(two_symbol(n, libprefix) for n in TWO)
    s += misc_symbols(libprefix)
    return s


# ---------------------------------------------------------------------------
# 回路図を組み立てる
# ---------------------------------------------------------------------------
class Sch:
    def __init__(self):
        self.items = []
        self.refs = set()
        self.nflag = 0

    def _instances(self, ref):
        return (f'(instances (project {q(PROJECT)} (path {q("/" + ROOT_UUID)} (reference {q(ref)}) (unit 1))))')

    def _symbol(self, sym, ref, x, y, value, part, pinnums, ref_at, val_at, in_bom=True, on_board=True,
                show_value=True):
        assert ref not in self.refs, ref
        self.refs.add(ref)
        fp = lcsc = mpn = desc = ""
        if part:
            p = PARTS[part]
            fp, lcsc, mpn, desc = f'{LIB}:{FP[p["fp"]]}', p.get("lcsc", ""), p.get("mpn", ""), p.get("desc", "")
        rj = f"(justify {ref_at[2]})" if len(ref_at) > 2 else ""
        vj = f"(justify {val_at[2]})" if len(val_at) > 2 else ""
        s = [f'(symbol (lib_id {q(LIB + ":" + sym)}) (at {f(x)} {f(y)} 0) (unit 1) (exclude_from_sim no) '
             f'(in_bom {"yes" if in_bom else "no"}) (on_board {"yes" if on_board else "no"}) (dnp no) '
             f'(uuid {q(uid("sym", ref))})\n',
             f'(property "Reference" {q(ref)} (at {f(ref_at[0])} {f(ref_at[1])} 0) '
             f'(effects (font (size 1.27 1.27)) {rj}{"" if not ref.startswith("#") else " (hide yes)"}))\n',
             f'(property "Value" {q(value)} (at {f(val_at[0])} {f(val_at[1])} 0) '
             f'(effects (font (size 1.27 1.27)) {vj}{"" if show_value else " (hide yes)"}))\n',
             f'(property "Footprint" {q(fp)} (at {f(x)} {f(y)} 0) {FONT_HIDE})\n',
             f'(property "Datasheet" "" (at {f(x)} {f(y)} 0) {FONT_HIDE})\n',
             f'(property "Description" {q(desc)} (at {f(x)} {f(y)} 0) {FONT_HIDE})\n']
        if part:
            s.append(f'(property "LCSC" {q(lcsc)} (at {f(x)} {f(y)} 0) {FONT_HIDE})\n')
            s.append(f'(property "MPN" {q(mpn)} (at {f(x)} {f(y)} 0) {FONT_HIDE})\n')
        for n in pinnums:
            s.append(f'(pin {q(n)} (uuid {q(uid("pin", ref, n))}))\n')
        s.append(self._instances(ref) + ")\n")
        self.items.append("".join(s))

    def wire(self, x1, y1, x2, y2):
        self.items.append(f'(wire (pts (xy {f(x1)} {f(y1)}) (xy {f(x2)} {f(y2)})) (stroke (width 0) (type default)) '
                          f'(uuid {q(uid("w", x1, y1, x2, y2))}))\n')

    def label(self, net, x, y, side):
        ang, just = (180, "right bottom") if side == "L" else (0, "left bottom")
        self.items.append(f'(label {q(net)} (at {f(x)} {f(y)} {ang}) (effects (font (size 1.27 1.27)) (justify {just})) '
                          f'(uuid {q(uid("l", net, x, y))}))\n')

    def nc(self, x, y):
        self.items.append(f'(no_connect (at {f(x)} {f(y)}) (uuid {q(uid("nc", x, y))}))\n')

    def text(self, s, x, y, size=1.27, bold=False):
        self.items.append(f'(text {q(s)} (exclude_from_sim no) (at {f(x)} {f(y)} 0) (effects (font (size {size} {size})'
                          f'{" (bold yes)" if bold else ""}) (justify left top)) (uuid {q(uid("t", s[:40], x, y))}))\n')

    def rect(self, x1, y1, x2, y2):
        self.items.append(f'(rectangle (start {f(x1)} {f(y1)}) (end {f(x2)} {f(y2)}) (stroke (width 0.2) (type dash)) '
                          f'(fill (type none)) (uuid {q(uid("r", x1, y1, x2, y2))}))\n')

    def _attach(self, px, py, side, net):
        """ピンの先 (px, py) に、短い線とラベル (net が None なら未接続の印) を付ける。"""
        if net is None:
            self.nc(px, py)
            return
        ex = px - 2.54 if side == "L" else px + 2.54
        self.wire(px, py, ex, py)
        self.label(net, ex, py, side)

    def ic(self, ref, sym, x, y, part, nets, value=None):
        w, top, n, pins = box_geometry(sym)
        missing = set(pins) - set(nets)
        extra = set(nets) - set(pins)
        assert not missing and not extra, (ref, missing, extra)
        value = value or PARTS[part]["value"]
        self._symbol(sym, ref, x, y, value, part, list(pins),
                     (x - w / 2, y - top - 3.81, "left"), (x - w / 2, y - top + (n - 1) * 2.54 + 3.81, "left"))
        for num, (px, py, side, _nm, _et) in pins.items():
            self._attach(x + px, y - py, side, nets[num])

    def two(self, ref, sym, x, y, part, net_l, net_r, value=None):
        """横向きの 2 端子の部品。net_l は左 (ダイオードではアノード)、net_r は右 (カソード)。"""
        d = TWO[sym]
        value = value or PARTS[part]["value"]
        self._symbol(sym, ref, x, y, value, part, list(d["pins"]),
                     (x - 3.81, y + 2.54, "left"), (x - 3.81 + 1.3 * len(ref) + 1.0, y + 2.54, "left"),
                     in_bom=(part != "JP_SOLDER"))   # はんだジャンパーは銅の模様だけで、載せる部品がない
        self._attach(x - 3.81, y, "L", net_l)
        self._attach(x + 3.81, y, "R", net_r)

    def tp(self, ref, x, y, net, value):
        self._symbol("TestPoint", ref, x, y, value, "TP", ["1"], (x + 3.0, y - 1.0, "left"), (x + 3.0, y + 1.0, "left"),
                     in_bom=False)
        self._attach(x - 2.54, y, "L", net)

    def hole(self, ref, x, y):
        self._symbol("MountingHole", ref, x, y, "M3", "HOLE", [], (x + 2.5, y - 1.0, "left"), (x + 2.5, y + 1.0, "left"),
                     in_bom=False)

    def flag(self, x, y, net):
        self.nflag += 1
        ref = f"#FLG{self.nflag:02d}"
        self._symbol("PWR_FLAG", ref, x, y, "PWR_FLAG", None, ["1"], (x, y - 2.0), (x + 4.3, y, "left"), in_bom=False,
                     on_board=False)
        self._attach(x, y, "L", net)

    def rows(self, x, y, items, pitch=7.62):
        """2 端子の部品を縦に並べる。items = [(ref, sym, part, net_l, net_r), ...]"""
        for i, it in enumerate(items):
            self.two(it[0], it[1], x, y + i * pitch, it[2], it[3], it[4])

    def block(self, x1, y1, x2, y2, title, notes=""):
        self.rect(x1, y1, x2, y2)
        self.text(title, x1 + 1.5, y1 + 1.2, size=2.0, bold=True)
        if notes:
            self.text(notes, x1 + 1.5, y1 + 5.5, size=1.27)

    def dump(self):
        libsyms = all_symbols(LIB + ":")
        return (f'(kicad_sch (version 20250114) (generator "pcie_tuner_gen") (generator_version "1.0")\n'
                f'(uuid {q(ROOT_UUID)})\n(paper "A2")\n'
                f'(title_block (title "PCIe tuner external power board") (date "2026-11-11") (rev "B") '
                f'(company "danything") (comment 1 "USB-C x2 -> 3.3V / 12V for USB-data PCIe tuner cards (PX-MLT5PE etc.)") '
                f'(comment 2 "Generated by scripts/gen_schematic.py - edit the script, not this file"))\n'
                f'(lib_symbols\n{libsyms})\n' + "".join(self.items)
                + '(sheet_instances (path "/" (page "1")))\n(embedded_fonts no)\n)\n')


def g(v):
    """2.54mm の格子にそろえる。"""
    return round(v / 2.54) * 2.54


def build() -> Sch:
    s = Sch()
    D = "D_A1K2"

    # ---------------- ① USB-C J1 + U1 -------------------------------------
    bx, by = 20, 20
    s.block(bx, by, bx + 185, by + 118, "(1) USB-C J1: data + power  /  U1: PD sink, requests 9V",
            "CH224A: Rset 6.8k on CFG1 = 9V (datasheet table 5-1). VHV and VBUS pins tied to the connector VBUS, 1uF on VHV.\n"
            "CC1/CC2 go straight to U1 (Rd is inside U1). DP/DM of U1 are not used (data goes to J4 only).\n"
            "CFG2/CFG3 = I2C (0x22/0x23, address not selectable) -> own bus per chip. PG is not used (state is read over I2C).\n"
            "D1 blocks back-feed from VIN to the PC. Shield: 1M || 100nF to GND.\n"
            "R28 || R29 = 1k bleeder: pulls VBUS1 below 0.8V against the reverse leakage of D1 when only J2 is powered.")
    s.ic("J1", "USB_C_16P", g(bx + 30), g(by + 62), "USBC",
         {"A4B9": "VBUS1", "B4A9": "VBUS1", "A5": "J1_CC1", "B5": "J1_CC2", "A6": "USB_DP", "B6": "USB_DP",
          "A7": "USB_DN", "B7": "USB_DN", "A8": None, "B8": None, "A1B12": "GND", "B1A12": "GND",
          "1": "SHIELD1", "2": "SHIELD1", "3": "SHIELD1", "4": "SHIELD1"})
    s.ic("U1", "CH224A", g(bx + 95), g(by + 50), "CH224A",
         {"1": "VBUS1", "8": "VBUS1", "7": "J1_CC1", "6": "J1_CC2", "4": None, "5": None, "10": None,  
          "9": "CFG1_U1", "2": "I2C1_SCL", "3": "I2C1_SDA", "11": "GND"})
    s.rows(g(bx + 150), g(by + 38), [
        ("C1", "C", "C_1U", "VBUS1", "GND"),
        ("R1", "R", "R_6K8", "CFG1_U1", "GND"),
        ("R28", "R", "R_2K", "VBUS1", "GND"),
        ("R29", "R", "R_2K", "VBUS1", "GND"),
        ("R3", "R", "R_1M", "SHIELD1", "GND"),
        ("C2", "C", "C_100N", "SHIELD1", "GND"),
        ("D1", PARTS["SS54"]["sym"], "SS54", "VBUS1", "VIN"),
    ])

    # ---------------- ② USB-C J2 + U2 -------------------------------------
    bx, by = 210, 20
    s.block(bx, by, bx + 185, by + 118, "(2) USB-C J2: power only (charger)  /  U2: PD sink, requests 9V",
            "Same circuit as (1). D+/D- of J2 are not connected. Shield of J2 goes straight to GND.\n"
            "D2 blocks back-feed from VIN to the charger port; D1/D2 together pick the higher input.")
    s.ic("J2", "USB_C_16P", g(bx + 30), g(by + 62), "USBC",
         {"A4B9": "VBUS2", "B4A9": "VBUS2", "A5": "J2_CC1", "B5": "J2_CC2", "A6": None, "B6": None,
          "A7": None, "B7": None, "A8": None, "B8": None, "A1B12": "GND", "B1A12": "GND",
          "1": "GND", "2": "GND", "3": "GND", "4": "GND"})
    s.ic("U2", "CH224A", g(bx + 95), g(by + 50), "CH224A",
         {"1": "VBUS2", "8": "VBUS2", "7": "J2_CC1", "6": "J2_CC2", "4": None, "5": None, "10": None,   
          "9": "CFG1_U2", "2": "I2C2_SCL", "3": "I2C2_SDA", "11": "GND"})
    s.rows(g(bx + 150), g(by + 38), [
        ("C3", "C", "C_1U", "VBUS2", "GND"),
        ("R4", "R", "R_6K8", "CFG1_U2", "GND"),
        ("R30", "R", "R_2K", "VBUS2", "GND"),
        ("R31", "R", "R_2K", "VBUS2", "GND"),
        ("D2", PARTS["SS54"]["sym"], "SS54", "VBUS2", "VIN"),
    ])

    # ---------------- VIN bus ---------------------------------------------
    bx, by = 400, 20
    s.block(bx, by, bx + 85, by + 118, "VIN bus (4.2 .. 9V)",
            "No TVS: every part on VIN is rated 25V or more\n(U3 30V, U4 24V, U6 30V, capacitors 25V),\nso a 20V charger fault does not break anything.\nBulk capacitors sit behind D1/D2.")
    s.rows(g(bx + 40), g(by + 34), [
        ("C4", "C", "C_22U", "VIN", "GND"),
        ("C5", "C", "C_22U", "VIN", "GND"),
    ])
    s.tp("TP1", g(bx + 40), g(by + 60), "VIN", "VIN")
    s.tp("TP5", g(bx + 40), g(by + 68), "GND", "GND")
    for i, n in enumerate(["VIN", "VBUS1", "VBUS2", "GND", "+3V3_BUCK", "+12V_BOOST", "+12V_SW", "+3V3", "+12V"]):
        s.flag(g(bx + 40), g(by + 78) + i * 5.08 - (0 if i < 4 else 0), n)

    # ---------------- 5V LDO ----------------------------------------------
    bx, by = 490, 20
    s.block(bx, by, bx + 84, by + 118, "U6: 5V LDO (MCU + J4 VBUS)",
            "HT7550-1: 1=GND 2=VIN(tab) 3=VOUT. 10uF in / 10uF out\n(datasheet application circuit).\n"
            "At VIN=5V the output follows VIN minus dropout\n(about 4.2 .. 4.9V).")
    s.ic("U6", "HT7550-1", g(bx + 42), g(by + 45), "HT7550", {"2": "VIN", "1": "GND", "3": "+5V"})
    s.rows(g(bx + 42), g(by + 66), [
        ("C6", "C", "C_10U", "VIN", "GND"),
        ("C7", "C", "C_10U", "+5V", "GND"),
    ])
    s.tp("TP4", g(bx + 42), g(by + 86), "+5V", "+5V")

    # ---------------- 3.3V buck -------------------------------------------
    bx, by = 20, 142
    s.block(bx, by, bx + 215, by + 110, "U3: 3.3V / 3A buck (TPS62933)  +  EN from J1 VBUS  +  JP1 (current measurement)",
            "Vout = 0.8V x (1 + 47k/15k) = 3.307V. RT open = 500kHz. L = 4.7uH (datasheet table 10-2). SS 100nF -> tSS = 100n x 0.8 / 5.5u = 14.5ms.\n"
            "EN = VBUS1 x 68k/(100k+68k) = 0.405 x VBUS1: turns on at VBUS1 > 3.0V typ (3.16V max), EN = 2.0V @5V, 3.6V @9V, 5.5V @13.6V.\n"
            "D5 clamps EN to +5V + Vf (< 6V abs max) if VBUS1 ever goes higher. MCU (PC3, open drain) can pull EN low. C15 1uF: EN rises in about 37ms.\n"
            "Charger on J2 alone -> VBUS1 = 0 -> EN low -> 3.3V stays off.")
    s.ic("U3", "TPS62933", g(bx + 40), g(by + 50), "TPS62933",
         {"3": "VIN", "2": "EN_3V3", "1": None, "7": "SS_3V3", "4": "GND", "6": "BST_3V3", "5": "SW_3V3",
          "8": "FB_3V3"})
    s.rows(g(bx + 100), g(by + 34), [
        ("C8", "C", "C_10U", "VIN", "GND"),
        ("C9", "C", "C_10U", "VIN", "GND"),
        ("C10", "C", "C_100N", "VIN", "GND"),
        ("C11", "C", "C_100N", "BST_3V3", "SW_3V3"),
        ("C12", "C", "C_100N", "SS_3V3", "GND"),
        ("L1", "L", "L_4U7", "SW_3V3", "+3V3_BUCK"),
        ("R6", "R", "R_47K", "+3V3_BUCK", "FB_3V3"),
        ("R7", "R", "R_15K", "FB_3V3", "GND"),
        ("C13", "C", "C_22U", "+3V3_BUCK", "GND"),
        ("C14", "C", "C_22U", "+3V3_BUCK", "GND"),
    ])
    s.rows(g(bx + 160), g(by + 34), [
        ("R8", "R", "R_100K", "VBUS1", "EN_3V3"),
        ("R9", "R", "R_68K", "EN_3V3", "GND"),
        ("C15", "C", "C_1U", "EN_3V3", "GND"),
        ("D5", PARTS["1N4148W"]["sym"], "1N4148W", "EN_3V3", "+5V"),
        ("R10", "R", "R_1K", "+3V3", "LED3_A"),
        ("LED3", PARTS["LED_R"]["sym"], "LED_R", "LED3_A", "GND"),
    ])
    s.ic("JP1", "HDR_1x2", g(bx + 160), g(by + 86), "HDR2", {"1": "+3V3_BUCK", "2": "+3V3"}, value="JP1 3V3 current")
    s.tp("TP2", g(bx + 160), g(by + 100), "+3V3", "+3V3")
    s.rows(g(bx + 195), g(by + 86), [("JP5", "JP_SOLDER", "JP_SOLDER", "+3V3_BUCK", "+3V3")])

    # ---------------- 12V boost -------------------------------------------
    bx, by = 240, 142
    s.block(bx, by, bx + 225, by + 110, "U4: 12V / 0.5A boost (MT3608B)  +  Q1/Q2 output switch  +  JP2 (current measurement)",
            "Vout = 0.6V x (1 + 100k/5.1k) = 12.36V. L = 4.7uH, D4 = SS34 (datasheet application). EN pulled down 100k -> off with a blank MCU.\n"
            "A boost passes VIN to its output when stopped, so Q1 (AO3401A, Vgs max +-12V) cuts the output. Q2 and Q3 in series pull the gate down\n"
            "through 100k only when SW12_ON is high AND +3.3V is present: Vgs = -12.36 x 100k/200k = -6.2V (-9.8V if VIN = 20V).\n"
            "C32 47nF drain-gate slows the edge to about 2 V/ms. Q2 gate pulled down 100k -> off with a blank MCU.\n"
            "F1 (PTC 0.75A hold) protects against a short on the card. R18 bleeds the +12V line to 0V when off.")
    s.ic("U4", "MT3608B", g(bx + 35), g(by + 50), "MT3608B",
         {"5": "VIN", "4": "EN_12V", "2": "GND", "1": "SW_12V", "3": "FB_12V", "6": None})
    s.rows(g(bx + 90), g(by + 34), [
        ("C16", "C", "C_22U", "VIN", "GND"),
        ("C17", "C", "C_100N", "VIN", "GND"),
        ("L2", "L", "L_4U7", "VIN", "SW_12V"),
        ("D4", PARTS["SS34"]["sym"], "SS34", "SW_12V", "+12V_BOOST"),
        ("R11", "R", "R_100K", "+12V_BOOST", "FB_12V"),
        ("R12", "R", "R_5K1", "FB_12V", "GND"),
        ("C18", "C", "C_22U", "+12V_BOOST", "GND"),
        ("C19", "C", "C_22U", "+12V_BOOST", "GND"),
        ("R13", "R", "R_100K", "EN_12V", "GND"),
    ])
    s.ic("Q1", "PMOS_GSD", g(bx + 150), g(by + 40), "AO3401A", {"1": "Q1_G", "2": "+12V_BOOST", "3": "+12V_SW"})
    s.ic("Q2", "NMOS_GSD", g(bx + 150), g(by + 54), "2N7002", {"1": "SW12_ON", "3": "Q2_D", "2": "Q2_S"})
    s.ic("Q3", "NMOS_GSD", g(bx + 150), g(by + 64), "2N7002", {"1": "+3V3", "3": "Q2_S", "2": "GND"})
    s.rows(g(bx + 150), g(by + 72), [
        ("R14", "R", "R_100K", "Q1_G", "+12V_BOOST"),
        ("C20", "C", "C_100N", "Q1_G", "+12V_BOOST"),
        ("C32", "C", "C_47N", "Q1_G", "+12V_SW"),
        ("R15", "R", "R_100K", "Q1_G", "Q2_D"),
        ("R16", "R", "R_100K", "SW12_ON", "GND"),
    ])
    s.ic("JP2", "HDR_1x2", g(bx + 200), g(by + 40), "HDR2", {"1": "+12V_F", "2": "+12V"}, value="JP2 12V current")
    s.rows(g(bx + 200), g(by + 56), [
        ("F1", "F", "PTC", "+12V_SW", "+12V_F"),
        ("R18", "R", "R_10K", "+12V", "GND"),
    ])
    s.tp("TP3", g(bx + 200), g(by + 82), "+12V", "+12V")

    # ---------------- USB data --------------------------------------------
    bx, by = 475, 142
    s.block(bx, by, bx + 99, by + 110, "USB 2.0 data: J1 -> U5 (ESD) -> J4",
            "SRV05-4: 1=IO1 2=GND 3=IO2 4=IO3 5=REF 6=IO4.\nD+ on IO1, D- on IO2 (one diode pair per line).\nIO3, IO4 not used.\n"
            "REF is left open: its TVS breaks down at 6V,\nVBUS1 can be 9V.\n"
            "J4 = motherboard USB 2.0 header pinout:\n1 VBUS, 3 D-, 5 D+, 7 GND, 9 key (pull the pin).\n"
            "JP3 (solder jumper, closed) feeds +5V to J4 pin 1.")
    s.ic("U5", "SRV05-4", g(bx + 48), g(by + 55), "SRV05",
         {"1": "USB_DP", "3": "USB_DN", "2": "GND", "6": None, "4": None, "5": None})
    s.ic("J4", "HDR_2x5", g(bx + 48), g(by + 80), "HDR10",
         {"1": "USBH_VBUS", "3": "USB_DN", "5": "USB_DP", "7": "GND", "9": None,
          "2": "USBH_VBUS", "4": None, "6": None, "8": "GND", "10": None}, value="J4 USB header")
    s.rows(g(bx + 48), g(by + 104), [("JP3", "JP_SOLDER", "JP_SOLDER", "+5V", "USBH_VBUS")])

    # ---------------- MCU -------------------------------------------------
    bx, by = 20, 256
    s.block(bx, by, bx + 280, by + 118, "U7: CH32V003F4P6 - reads CC / VIN / VBUS1, switches 3.3V and 12V",
            "VDD = +5V (4.2 .. 5V). ADC reference = VDD, so firmware corrects with the internal Vref channel.\n"
            "CC1/CC2: 100k series + 100nF (the 100k keeps the load off the PD line; fault current into the pin < 0.2mA).\n"
            "VIN / VBUS1 sense = x 33k/(100k+33k) = 0.248: 5V -> 1.24V, 9V -> 2.23V, 20V (TVS clamp) -> 4.96V  (below VDD = 5V whenever VIN > 5.5V).\n"
            "PC3 = EN_3V3 and PC4 = PERST# (drive low or leave Hi-Z, never push-pull high). PD2 = EN_12V, PD3 = SW12_ON (100k pull-downs).\n"
            "PA2/A0 = +12V sense (x 0.248: 12.36V -> 3.07V).\n"
            "I2C1 (PC1/PC2) -> U1. Remap I2C1 to PC5/PC6 (AFIO I2C1_RM = 10b) -> U2. No external pull-ups: CH224A has them inside.\n"
            "J5: 1 = SWIO, 2 = GND (WCH-LinkE). SW1: closed to GND = manual 12V override.")
    s.ic("U7", "CH32V003F4P6", g(bx + 60), g(by + 75), "CH32V003",
         {"9": "+5V", "1": "VIN_SENSE", "2": "VBUS1_SENSE", "3": "CC1_SENSE", "5": "CC2_SENSE", "6": "12V_SENSE",
          "19": "EN_12V", "20": "SW12_ON", "4": None, "7": "GND", "10": "SW1_IN", "11": "I2C1_SDA", "12": "I2C1_SCL",
          "13": "EN_3V3", "14": "PERST#", "15": "I2C2_SCL", "16": "I2C2_SDA", "17": None, "8": "LED_STAT",
          "18": "SWIO"})
    s.rows(g(bx + 135), g(by + 50), [
        ("C21", "C", "C_100N", "+5V", "GND"),
        ("C22", "C", "C_1U", "+5V", "GND"),
        ("R19", "R", "R_10K", "+5V", "SW1_IN"),
        ("R20", "R", "R_1K", "LED_STAT", "LED5_A"),
        ("LED5", PARTS["LED_R"]["sym"], "LED_R", "LED5_A", "GND"),
    ])
    s.ic("SW1", "SW_SPDT", g(bx + 135), g(by + 96), "MSK12C02", {"2": "SW1_IN", "1": "GND", "3": None, "4": "GND"})
    s.ic("J5", "HDR_1x2", g(bx + 135), g(by + 112), "HDR2", {"1": "SWIO", "2": "GND"}, value="J5 SWIO / GND")
    s.rows(g(bx + 190), g(by + 50), [
        ("R21", "R", "R_100K", "J1_CC1", "CC1_SENSE"),
        ("C23", "C", "C_100N", "CC1_SENSE", "GND"),
        ("R22", "R", "R_100K", "J1_CC2", "CC2_SENSE"),
        ("C24", "C", "C_100N", "CC2_SENSE", "GND"),
    ])
    s.rows(g(bx + 245), g(by + 50), [
        ("R23", "R", "R_100K", "VIN", "VIN_SENSE"),
        ("R24", "R", "R_33K", "VIN_SENSE", "GND"),
        ("C25", "C", "C_100N", "VIN_SENSE", "GND"),
        ("R25", "R", "R_100K", "VBUS1", "VBUS1_SENSE"),
        ("R26", "R", "R_33K", "VBUS1_SENSE", "GND"),
        ("C26", "C", "C_100N", "VBUS1_SENSE", "GND"),
        ("R32", "R", "R_100K", "+12V", "12V_SENSE"),
        ("R33", "R", "R_33K", "12V_SENSE", "GND"),
        ("C33", "C", "C_100N", "12V_SENSE", "GND"),
    ])

    # ---------------- PCIe slot -------------------------------------------
    bx, by = 305, 256
    s.block(bx, by, bx + 190, by + 118, "J3: PCI Express x1 slot - power pins only",
            "Pin names follow the PCIe CEM pinout (side B = component side of the card, side A = solder side).\n"
            "+12V: A2 A3 B1 B2 B3.  +3.3V: A9 A10 B8.  3.3Vaux: B10 via JP4 (solder jumper, closed).\n"
            "GND: A4 A12 A15 A18 B4 B7 B13 B16 B18.  PERST# (A11): 15k to +3.3V, 10uF to GND -> 2.0V about 140ms after 3.3V. D6 empties C31 when 3.3V drops.\n"
            "PRSNT#, WAKE#, JTAG, SMBus, REFCLK and the lane pins are left open.")
    s.ic("J3", "PCIE_X1", g(bx + 60), g(by + 72), "PCIE",
         {"A1": None, "A2": "+12V", "A3": "+12V", "A4": "GND", "A5": None, "A6": None, "A7": None, "A8": None,
          "A9": "+3V3", "A10": "+3V3", "A11": "PERST#", "A12": "GND", "A13": None, "A14": None, "A15": "GND",
          "A16": None, "A17": None, "A18": "GND",
          "B1": "+12V", "B2": "+12V", "B3": "+12V", "B4": "GND", "B5": None, "B6": None, "B7": "GND", "B8": "+3V3",
          "B9": None, "B10": "+3V3AUX", "B11": None, "B12": None, "B13": "GND", "B14": None, "B15": None,
          "B16": "GND", "B17": None, "B18": "GND"}, value="PCIe x1 slot")
    s.rows(g(bx + 150), g(by + 50), [
        ("C27", "C", "C_22U", "+3V3", "GND"),
        ("C28", "C", "C_100N", "+3V3", "GND"),
        ("C29", "C", "C_10U", "+12V", "GND"),
        ("C30", "C", "C_100N", "+12V", "GND"),
        ("R27", "R", "R_15K", "+3V3", "PERST#"),
        ("D6", PARTS["1N4148W"]["sym"], "1N4148W", "PERST#", "+3V3"),
        ("C31", "C", "C_10U", "PERST#", "GND"),
        ("JP4", "JP_SOLDER", "JP_SOLDER", "+3V3", "+3V3AUX"),
    ])

    # ---------------- mechanical ------------------------------------------
    bx, by = 505, 256
    s.block(bx, by, bx + 69, by + 118, "Mechanical", "M3 mounting holes (not plated,\nno net).")
    for i in range(4):
        s.hole(f"H{i + 1}", g(bx + 20), g(by + 30) + i * 10.16)
    return s


def main():
    os.makedirs(os.path.join(ROOT, "lib"), exist_ok=True)
    with open(os.path.join(ROOT, "lib", f"{LIB}.kicad_sym"), "w", encoding="utf-8", newline="\n") as fh:
        fh.write('(kicad_symbol_lib (version 20241209) (generator "pcie_tuner_gen") (generator_version "1.0")\n'
                 + all_symbols() + ")\n")
    s = build()
    with open(os.path.join(ROOT, f"{PROJECT}.kicad_sch"), "w", encoding="utf-8", newline="\n") as fh:
        fh.write(s.dump())
    print(f"symbols: {len(BOX) + len(TWO) + 3}, components: {len([r for r in s.refs if not r.startswith('#')])}")


if __name__ == "__main__":
    main()
