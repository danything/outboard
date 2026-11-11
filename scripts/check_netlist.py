"""回路図から書き出したネットリスト (out/netlist.net) を、設計の決めごとと突き合わせる。

回路図を作るスクリプト (gen_schematic.py) とは別に、「こうつながっているはず」をここにもう一度書いてある。
両方が同じ思い違いをしていない限り、つなぎ間違いはここで落ちる。
結果は out/netlist_check.txt に残す。1 つでも NG があれば終了コード 1。

使い方: python scripts/check_netlist.py
"""
from __future__ import annotations

import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sexpr import find, find_all, parse  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load(path=None):
    t = parse(open(path or os.path.join(ROOT, "out", "netlist.net"), encoding="utf-8").read())
    comps = {}
    for c in find_all(find(t, "components"), "comp"):
        ref = str(find(c, "ref")[1])
        fields = {}
        fl = find(c, "fields")
        if fl:
            for fd in find_all(fl, "field"):
                fields[str(find(fd, "name")[1])] = str(fd[2]) if len(fd) > 2 else ""
        fp = find(c, "footprint")
        comps[ref] = dict(value=str(find(c, "value")[1]), footprint=str(fp[1]) if fp else "", fields=fields)
    nets = {}
    pin = {}
    func = {}
    for n in find_all(find(t, "nets"), "net"):
        name = str(find(n, "name")[1])
        name = name[1:] if name.startswith("/") else name
        nodes = []
        for nd in find_all(n, "node"):
            r, p = str(find(nd, "ref")[1]), str(find(nd, "pin")[1])
            nodes.append((r, p))
            pin[(r, p)] = name
            pf = find(nd, "pinfunction")
            func[(r, p)] = str(pf[1]).split("_")[0] if pf else ""
        nets[name] = nodes
    return comps, nets, pin, func


def ohms(v):
    m = re.match(r"^([\d.]+)\s*([kM]?)$", v.strip())
    return float(m.group(1)) * {"": 1, "k": 1e3, "M": 1e6}[m.group(2)]


def farads(v):
    m = re.match(r"^([\d.]+)\s*([pnu])F(?:\s+([\d.]+)V)?", v.strip())
    return float(m.group(1)) * {"p": 1e-12, "n": 1e-9, "u": 1e-6}[m.group(2)], float(m.group(3) or 0)


class Checker:
    def __init__(self):
        self.comps, self.nets, self.pin, self.func = load()
        self.rows = []
        self.ng = 0

    def ok(self, title, cond, detail=""):
        self.rows.append(("OK" if cond else "NG", title, detail))
        if not cond:
            self.ng += 1

    def net(self, ref, p):
        return self.pin.get((ref, p), "<none>")

    def is_nc(self, ref, p):
        n = self.net(ref, p)
        return n.startswith("unconnected-") and len(self.nets[n]) == 1

    def two_pin(self, ref):
        return self.net(ref, "1"), self.net(ref, "2")

    def between(self, prefix, a, b):
        """a と b の間に入っている 2 端子の部品 (参照名が prefix で始まるもの)。"""
        out = []
        for ref in self.comps:
            if ref.startswith(prefix) and not ref.startswith("#") and (ref, "3") not in self.pin:
                if {self.net(ref, "1"), self.net(ref, "2")} == {a, b}:
                    out.append(ref)
        return out

    def diode(self, ref):
        a = [p for (r, p), f in self.func.items() if r == ref and f == "A"][0]
        k = [p for (r, p), f in self.func.items() if r == ref and f == "K"][0]
        return self.net(ref, a), self.net(ref, k)

    def run(self):
        c = self
        # ---- 1. PCIe スロット ------------------------------------------------
        want = {}
        for p in "A2 A3 B1 B2 B3".split():
            want[p] = "+12V"
        for p in "A9 A10 B8".split():
            want[p] = "+3V3"
        want["B10"] = "+3V3AUX"
        want["A11"] = "PERST#"
        for p in "A4 A12 A15 A18 B4 B7 B13 B16 B18".split():
            want[p] = "GND"
        allpins = [f"{s}{i}" for s in "AB" for i in range(1, 19)]
        bad = [f"{p}:{c.net('J3', p)}" for p in allpins if p in want and c.net("J3", p) != want[p]]
        c.ok("J3: 電源・GND・PERST# の 18 ピンが決めたネットにつながっている", not bad and len(want) == 19,
             "NG: " + " ".join(bad) if bad else "+12V x5, +3V3 x3, +3V3AUX x1, PERST# x1, GND x9")
        bad = [p for p in allpins if p not in want and not c.is_nc("J3", p)]
        c.ok("J3: ほかの 17 ピン (PRSNT#・WAKE#・JTAG・SMBus・REFCLK・レーン) はどこにもつながっていない", not bad,
             " ".join(bad) or f"{len([p for p in allpins if p not in want])} ピン")
        for netname, pins in (("+12V", "A2 A3 B1 B2 B3"), ("+3V3AUX", "B10"), ("PERST#", "A11")):
            got = sorted(p for r, p in c.nets[netname] if r == "J3")
            c.ok(f"J3: {netname} のネットに乗っているスロットのピンは {pins} だけ", got == sorted(pins.split()), " ".join(got))
        got = sorted(p for r, p in c.nets["+3V3"] if r == "J3")
        c.ok("J3: +3V3 のネットに乗っているスロットのピンは A9 A10 B8 だけ", got == ["A10", "A9", "B8"], " ".join(got))

        # ---- 2. 電源どうしの短絡 ---------------------------------------------
        rails = ["GND", "VIN", "VBUS1", "VBUS2", "+5V", "+3V3", "+3V3_BUCK", "+12V", "+12V_BOOST", "+12V_SW",
                 "+12V_F", "USBH_VBUS", "+3V3AUX"]
        c.ok("電源のネットが別々に存在する (名前の取り違えで 1 つにまとまっていない)", all(r in c.nets for r in rails),
             f"{len(rails)} 本")
        links = {}
        for ref in c.comps:
            if re.match(r"^(L|JP)\d+$", ref):
                links[ref] = frozenset(c.two_pin(ref))
        expect = {"L1": {"SW_3V3", "+3V3_BUCK"}, "L2": {"VIN", "SW_12V"}, "JP1": {"+3V3_BUCK", "+3V3"},
                  "JP2": {"+12V_F", "+12V"}, "JP3": {"+5V", "USBH_VBUS"}, "JP4": {"+3V3", "+3V3AUX"},
                  "JP5": {"+3V3_BUCK", "+3V3"}, "JP6": {"+12V_F", "+12V"}, "JP7": {"SW1_IN", "GND"}}
        c.ok("直流で素通しになる部品 (コイル・ジャンパー) がつなぐネットは決めたとおり",
             {k: set(v) for k, v in links.items()} == expect,
             "; ".join(f"{k}: {' - '.join(sorted(v))}" for k, v in sorted(links.items())))
        # 抵抗・コンデンサ以外で 2 本の電源にまたがる部品を数え上げる
        span = []
        for ref in sorted(c.comps):
            if ref.startswith(("R", "C", "#", "TP", "H", "L", "J")) and not ref.startswith("LED"):
                continue
            ns = {n for (r, p), n in c.pin.items() if r == ref and n in rails and n != "GND"}
            if len(ns) > 1:
                span.append(f"{ref}:{'/'.join(sorted(ns))}")
        expect_span = {"D1:VBUS1/VIN", "D2:VBUS2/VIN", "Q1:+12V_BOOST/+12V_SW", "U6:+5V/VIN", "F1:+12V_F/+12V_SW"}
        c.ok("端子のほかに 2 本以上の電源にまたがる部品は D1・D2・Q1・F1・U6 だけ (3.3V と 12V と VIN を直接つなぐ部品はない)",
             set(span) == expect_span, " ".join(span))
        r_span = []
        for ref in sorted(c.comps):
            if re.match(r"^R\d+$", ref):
                a, b = c.two_pin(ref)
                if a in rails and b in rails and "GND" not in (a, b):
                    r_span.append(ref)
        c.ok("電源と電源を直接つなぐ抵抗はない", not r_span, " ".join(r_span) or "0 個")

        # ---- 3. USB のデータ線 -----------------------------------------------
        dp = sorted(c.nets["USB_DP"])
        dn = sorted(c.nets["USB_DN"])
        c.ok("USB_DP: J1 の A6・B6、U5 の 1 (IO1)、J4 の 5 だけ", dp == sorted([("J1", "A6"), ("J1", "B6"), ("U5", "1"), ("J4", "5")]),
             " ".join(f"{r}.{p}" for r, p in dp))
        c.ok("USB_DN: J1 の A7・B7、U5 の 3 (IO2)、J4 の 3 だけ", dn == sorted([("J1", "A7"), ("J1", "B7"), ("U5", "3"), ("J4", "3")]),
             " ".join(f"{r}.{p}" for r, p in dn))
        c.ok("J4: 1・2 = USBH_VBUS、7・8 = GND、4・6・9・10 は未接続",
             c.net("J4", "1") == c.net("J4", "2") == "USBH_VBUS" and c.net("J4", "7") == c.net("J4", "8") == "GND"
             and all(c.is_nc("J4", p) for p in "4 6 9 10".split()))
        c.ok("U5: 2 = GND、5 (REF) は未接続 (REF の TVS は 6V で、9V の VBUS にはつなげない)、4・6 (IO3・IO4) も未接続",
             c.net("U5", "2") == "GND" and all(c.is_nc("U5", p) for p in "456"))
        c.ok("J2 の D+/D-/SBU と J1 の SBU は未接続",
             all(c.is_nc("J2", p) for p in "A6 A7 B6 B7 A8 B8".split()) and all(c.is_nc("J1", p) for p in ("A8", "B8")))

        # ---- 4. PD のシンク --------------------------------------------------
        for u, j, vb, bus in (("U1", "J1", "VBUS1", "I2C1"), ("U2", "J2", "VBUS2", "I2C2")):
            good = (c.net(u, "1") == vb and c.net(u, "8") == vb and c.net(j, "A4B9") == vb and c.net(j, "B4A9") == vb
                    and c.net(u, "6") == c.net(j, "A5") == f"{j}_CC1" and c.net(u, "7") == c.net(j, "B5") == f"{j}_CC2"
                    and c.net(u, "11") == "GND" and c.net(j, "A1B12") == "GND" and c.net(j, "B1A12") == "GND"
                    and c.is_nc(u, "4") and c.is_nc(u, "5") and c.is_nc(u, "10"))
            c.ok(f"{u}: VHV(1)・VBUS(8) = {vb}、IC の 6・7 (CC2・CC1) = {j} の A5・B5 (CC1・CC2。基板の上で線を交差させないため"
                 "入れ替えてある。IC は 2 本を同じに扱う)、GND、DP/DM と PG は未接続", good)
            # ブリーダ: VBUS -> (上の抵抗 2 本の並列) -> BLDn -> (下の抵抗 2 本の並列) -> GND
            mid = "BLD" + vb[-1]
            up, dn_ = c.between("R", vb, mid), c.between("R", mid, "GND")
            par = lambda rs: 1 / sum(1 / ohms(c.comps[r]["value"]) for r in rs) if rs else 0  # noqa: E731
            rp = par(up) + par(dn_)
            pw = 0.0
            for rs, share in ((up, par(up) / rp if rp else 0), (dn_, par(dn_) / rp if rp else 0)):
                for r in rs:
                    pw = max(pw, (21.0 * share) ** 2 / ohms(c.comps[r]["value"]))
            rated = min((0.125 if "0805" in c.comps[r]["footprint"] else 0.1) for r in up + dn_) if up + dn_ else 0
            c.ok(f"{vb}: GND へのブリーダは合成 1kΩ 以下。VBUS が 21V (20V の PD の上限) でも 1 本の損失が定格以下。"
                 f"{vb} から GND へじかにつながる抵抗はない",
                 0 < rp <= 1000 and pw <= rated and not c.between("R", vb, "GND") and len(up) == 2 and len(dn_) == 2,
                 f"{' '.join(up)} + {' '.join(dn_)}: 合成 {rp:.0f}Ω、21V で 1 本 {pw * 1e3:.0f} mW (定格 {rated * 1e3:.0f} mW)、"
                 f"9.9V で {pw * (9.9 / 21) ** 2 * 1e3:.0f} mW")
            cfg = c.net(u, "9")
            rs = [r for r in c.between("R", cfg, "GND")]
            val = ohms(c.comps[rs[0]]["value"]) if rs else 0
            c.ok(f"{u}: CFG1 と GND の間に 6.8kΩ (データシートの表 5-1 で 9V)、CFG1 にはほかに何もつながない",
                 len(rs) == 1 and val == 6800 and len(c.nets[cfg]) == 2, f"{rs} {val:.0f}Ω")
            caps = c.between("C", vb, "GND")
            tot = sum(farads(c.comps[x]["value"])[0] for x in caps)
            c.ok(f"{vb} (端子の側) のコンデンサは合計 10µF 以下で、VHV に 1µF がある", 1e-6 <= tot <= 10e-6,
                 f"{' '.join(caps)} = {tot * 1e6:.1f}µF")
            c.ok(f"{u}: I2C は {bus}_SCL(2)・{bus}_SDA(3) で、マイコンのピンとだけつながる",
                 c.net(u, "2") == f"{bus}_SCL" and c.net(u, "3") == f"{bus}_SDA"
                 and {r for r, _ in c.nets[f"{bus}_SCL"]} == {u, "U7"} and {r for r, _ in c.nets[f"{bus}_SDA"]} == {u, "U7"})
        c.ok("U1 と U2 の I2C は別のバス (アドレスを選べないため)", c.net("U1", "2") != c.net("U2", "2") and c.net("U1", "3") != c.net("U2", "3"))

        # ---- 5. ダイオードの向き ---------------------------------------------
        for ref, a, k in (("D1", "VBUS1", "VIN"), ("D2", "VBUS2", "VIN"),
                          ("D4", "SW_12V", "+12V_BOOST"), ("D5", "EN_3V3", "+5V"), ("D6", "PERST#", "+3V3"),
                          ("LED3", "LED3_A", "GND"), ("LED5", "LED5_A", "GND")):
            c.ok(f"{ref}: アノード = {a}、カソード = {k}", c.diode(ref) == (a, k), "%s -> %s" % c.diode(ref))
        c.ok("VIN から VBUS1・VBUS2 へ戻る道は D1・D2 (逆向き) だけ",
             {r for r, _ in c.nets["VBUS1"]} & {r for r, _ in c.nets["VIN"]} == {"D1"}
             and {r for r, _ in c.nets["VBUS2"]} & {r for r, _ in c.nets["VIN"]} == {"D2"})
        c.ok("VBUS1 と VBUS2 を直接つなぐ部品はない", not ({r for r, _ in c.nets["VBUS1"]} & {r for r, _ in c.nets["VBUS2"]}))

        # ---- 6. 3.3V の降圧と EN ---------------------------------------------
        good = (c.net("U3", "3") == "VIN" and c.net("U3", "4") == "GND" and c.net("U3", "2") == "EN_3V3"
                and c.net("U3", "5") == "SW_3V3" and c.net("U3", "6") == "BST_3V3" and c.net("U3", "7") == "SS_3V3"
                and c.net("U3", "8") == "FB_3V3" and c.is_nc("U3", "1"))
        c.ok("U3: 1 RT 未接続 (500kHz)、2 EN、3 VIN、4 GND、5 SW、6 BST、7 SS、8 FB", good)
        rt, rb = c.between("R", "+3V3_BUCK", "FB_3V3"), c.between("R", "FB_3V3", "GND")
        v33 = 0.8 * (1 + ohms(c.comps[rt[0]]["value"]) / ohms(c.comps[rb[0]]["value"]))
        c.ok("U3: 出力 = 0.8V × (1 + Rtop/Rbot) が 3.3V ± 3% (PCIe の許す幅は ±9%)", abs(v33 - 3.3) / 3.3 < 0.03,
             f"{rt[0]}/{rb[0]} -> {v33:.3f}V")
        c.ok("U3: BST-SW に 100nF、SS に 6.8nF 以上 (浮かせない)、入力に 10µF 以上と 100nF",
             len(c.between("C", "BST_3V3", "SW_3V3")) == 1 and farads(c.comps[c.between("C", "SS_3V3", "GND")[0]]["value"])[0] >= 6.8e-9
             and sum(farads(c.comps[x]["value"])[0] for x in c.between("C", "VIN", "GND")) >= 10e-6)
        css = farads(c.comps[c.between("C", "SS_3V3", "GND")[0]]["value"])[0]
        c.ok("U3: ソフトスタートの時間 = Css × 0.8V / 5.5µA", True, f"{css * 0.8 / 5.5e-6 * 1e3:.1f} ms")
        cout = sum(farads(c.comps[x]["value"])[0] for x in c.between("C", "+3V3_BUCK", "GND") + c.between("C", "+3V3", "GND"))
        c.ok("U3: 出力のコンデンサの公称の合計 (データシートの実効の目安 40µF、最小 15µF)", cout >= 40e-6, f"{cout * 1e6:.1f}µF")
        r1 = c.between("R", "VBUS1", "EN_3V3")
        r2 = c.between("R", "EN_3V3", "GND")
        R1, R2 = ohms(c.comps[r1[0]]["value"]), ohms(c.comps[r2[0]]["value"])
        ratio = R2 / (R1 + R2)
        ip, ih = 0.7e-6, 1.4e-6

        def ven(v, i):
            return (R2 * v + R1 * R2 * i) / (R1 + R2)

        vstart_typ = (1.21 * (R1 + R2) - R1 * R2 * ip) / R2
        vstart_max = (1.28 * (R1 + R2) - R1 * R2 * ip) / R2
        vstop = (1.17 * (R1 + R2) - R1 * R2 * (ip + ih)) / R2
        c.ok("U3 の EN は J1 の VBUS (VBUS1) からの分圧だけで上がる (VIN や VBUS2 からの抵抗はない)",
             len(r1) == 1 and len(r2) == 1 and not c.between("R", "VIN", "EN_3V3") and not c.between("R", "VBUS2", "EN_3V3")
             and not c.between("R", "+5V", "EN_3V3"), f"{r1[0]}={R1 / 1e3:.0f}k / {r2[0]}={R2 / 1e3:.0f}k, 比 {ratio:.3f}")
        c.ok("EN: VBUS1 が 4.0V (USB の下限) で確実にオン (しきい値の最大 1.28V)", vstart_max <= 3.8,
             f"オンになる VBUS1: 標準 {vstart_typ:.2f}V・最大 {vstart_max:.2f}V (EN 1.21V / 1.28V)、"
             f"オフ: 標準 {vstop:.2f}V・最小 {(1.10 * (R1 + R2) - R1 * R2 * (ip + ih)) / R2:.2f}V (EN 1.17V / 1.10V)")
        c.ok("EN: VBUS1 が 5V・9V・9.9V・12V のとき 5.5V (推奨の上限) 以下", ven(12, ip + ih) <= 5.5,
             " / ".join(f"{v}V -> {ven(v, ip + ih):.2f}V" for v in (5, 9, 9.9, 12)))
        vmax_55 = 5.5 / ratio
        c.ok("EN: 分圧だけで 6V (最大定格) に届く VBUS1", True, f"{6 / ratio:.1f}V (5.5V に届くのは {vmax_55:.1f}V)")
        c.ok("EN: それ以上の異常な電圧は D5 (EN -> +5V) が +5V + 0.7V = 5.7V 以下に抑える (最大定格 6V 未満)",
             c.diode("D5") == ("EN_3V3", "+5V"), f"20V のとき D5 に流れる電流 {(20 - 5.7) / R1 * 1e3:.2f} mA")
        users = sorted(f"{r}.{p}" for r, p in c.nets["EN_3V3"])
        rser = c.between("R", "EN_MCU", "EN_3V3")
        c.ok("EN_3V3 につながるのは U3 の EN・分圧・コンデンサ・D5 と、マイコンの PC3 への直列 1kΩ だけ",
             len(rser) == 1 and ohms(c.comps[rser[0]]["value"]) == 1000 and sorted(c.nets["EN_MCU"]) == sorted([("U7", "13"), (rser[0], "1")])
             and sorted(r for r, _ in c.nets["EN_3V3"]) == sorted(["U3", rser[0], r1[0], r2[0], "C15", "D5"]), " ".join(users))
        vlow = 5.0 * 1000 / (R1 + 1000)
        c.ok("EN: マイコンが PC3 を Low にしたとき、直列 1kΩ があっても EN はオフのしきい値 (最小 1.1V) より十分低い", vlow < 0.3,
             f"VBUS1 が 20V でも {20.0 * 1000 / (R1 + 1000):.2f}V、5V で {vlow:.2f}V")
        cen = farads(c.comps["C15"]["value"])[0]
        import math as _m
        ten = -(R1 * R2 / (R1 + R2)) * cen * _m.log(1 - 1.21 / (5 * ratio))
        c.ok("EN: VBUS1 が 5V になってから EN がしきい値に届くまで 20ms 以上 (挿した直後のばたつきを避ける)", ten >= 0.02,
             f"C15 {cen * 1e6:.1f}µF: {ten * 1e3:.0f} ms")

        # ---- 7. 12V の昇圧と出力スイッチ -------------------------------------
        good = (c.net("U4", "5") == "VIN" and c.net("U4", "2") == "GND" and c.net("U4", "4") == "EN_12V"
                and c.net("U4", "1") == "SW_12V" and c.net("U4", "3") == "FB_12V" and c.is_nc("U4", "6"))
        c.ok("U4: 1 SW、2 GND、3 FB、4 EN、5 VIN、6 NC", good)
        rt, rb = c.between("R", "+12V_BOOST", "FB_12V"), c.between("R", "FB_12V", "GND")
        v12 = 0.6 * (1 + ohms(c.comps[rt[0]]["value"]) / ohms(c.comps[rb[0]]["value"]))
        c.ok("U4: 出力 = 0.6V × (1 + R1/R2) が 12V ± 8% の中 (PCIe の許す幅)", 11.04 <= v12 <= 12.96, f"{rt[0]}/{rb[0]} -> {v12:.2f}V")
        c.ok("U4: コイルは VIN と SW の間、D4 は SW から +12V_BOOST", c.between("L", "VIN", "SW_12V") == ["L2"])
        pd = c.between("R", "EN_12V", "GND")
        c.ok("U4 の EN は抵抗で GND に落ちている (マイコンが空・リセット中は昇圧しない)", len(pd) == 1,
             f"{pd} {c.comps[pd[0]]['value']}" if pd else "")
        c.ok("U4 の EN につながるのは U4・プルダウン・マイコンの PC3 だけ",
             sorted(r for r, _ in c.nets["EN_12V"]) == sorted(["U4", "U7", pd[0]]))
        c.ok("Q1: 1 G = Q1_G、2 S = +12V_BOOST、3 D = +12V_SW (ボディダイオードは出力から昇圧の側を向く)",
             c.net("Q1", "1") == "Q1_G" and c.net("Q1", "2") == "+12V_BOOST" and c.net("Q1", "3") == "+12V_SW")
        rgs = c.between("R", "Q1_G", "+12V_BOOST")
        rg = c.between("R", "Q1_G", "Q2_D")
        vgs = -v12 * ohms(c.comps[rgs[0]]["value"]) / (ohms(c.comps[rgs[0]]["value"]) + ohms(c.comps[rg[0]]["value"]))
        kdiv = ohms(c.comps[rgs[0]]["value"]) / (ohms(c.comps[rgs[0]]["value"]) + ohms(c.comps[rg[0]]["value"]))
        c.ok("Q1 (AO3401A、Vgs の最大 ±12V): ゲートはソースへ抵抗で引かれ (ふだんはオフ)、オンのときの Vgs は -4.5V から -12V の中。"
             "VIN が 20V (昇圧の出力に 19.5V が素通し) でも -12V を超えない", -12 < vgs <= -4.5 and 19.5 * kdiv < 12,
             f"{rgs[0]}/{rg[0]} -> Vgs = {vgs:.1f}V、VIN 20V のとき {-19.5 * kdiv:.1f}V")
        cdg = c.between("C", "Q1_G", "+12V_SW")
        cgs = c.between("C", "Q1_G", "+12V_BOOST")
        Cdg = farads(c.comps[cdg[0]]["value"])[0] if cdg else 0
        Cgs = farads(c.comps[cgs[0]]["value"])[0] if cgs else 0
        # 挿した瞬間: +12V_BOOST が VIN まで一気に上がる。出力 (0V) との間の Cdg と、ソースとの間の Cgs の分圧でゲートが取り残される
        vplug = 8.6 * Cdg / (Cdg + Cgs) if Cdg + Cgs else 9
        c.ok("Q1: ドレイン-ゲートの間に 33nF (立ち上がりを緩める)、ゲート-ソースの間に 1µF。挿した瞬間に容量の分圧でできる Vgs が"
             " 0.5V (Vth の最小) より小さい", len(cdg) == 1 and len(cgs) == 1 and abs(Cdg - 33e-9) < 1e-12 and vplug < 0.5,
             f"{' '.join(cdg)} {Cdg * 1e9:.0f}nF / {' '.join(cgs)} {Cgs * 1e6:.1f}µF: 9V の PD (VIN 8.6V) で {-vplug:.2f}V、"
             f"20V の異常 (19.6V) で {-19.6 * Cdg / (Cdg + Cgs):.2f}V。波形は out/sim/")
        c.ok("Q2: 1 G = Q2_G、3 D = Q2_D、2 S = Q2_S。ゲートは抵抗で GND に落ちている (マイコンが空なら 12V は出ない)。"
             "マイコンの SW12_ON からは 10kΩ を通る",
             c.net("Q2", "1") == "Q2_G" and c.net("Q2", "2") == "Q2_S" and c.net("Q2", "3") == "Q2_D"
             and len(c.between("R", "Q2_G", "GND")) == 1 and len(c.between("R", "SW12_ON", "Q2_G")) == 1
             and sorted(r for r, _ in c.nets["SW12_ON"]) == sorted(["U7", c.between("R", "SW12_ON", "Q2_G")[0]]))
        # 過電圧の遮断: VIN -> D7 (ツェナー) -> R35 -> Q4 のベース (R36 で GND へ)。Q4 のコレクタが Q2 のゲートを GND に引く
        rs, rbe = c.between("R", "OVP_Z", "OVP_B"), c.between("R", "OVP_B", "GND")
        good = (c.diode("D7") == ("OVP_Z", "VIN") and len(rs) == 1 and len(rbe) == 1 and c.net("Q4", "1") == "OVP_B"
                and c.net("Q4", "2") == "GND" and c.net("Q4", "3") == "Q2_G")
        c.ok("過電圧の遮断: D7 (カソード = VIN) -> R35 -> Q4 のベース、R36 でベースを GND へ、Q4 のコレクタ = Q2 のゲート", good)
        if good:
            Rs, Rbe = ohms(c.comps[rs[0]]["value"]), ohms(c.comps[rbe[0]]["value"])
            rser = ohms(c.comps[c.between("R", "SW12_ON", "Q2_G")[0]]["value"])
            # 効きはじめ: ベースが Vbe に届く = ツェナーに Vbe/Rbe が流れる。Vz は BZT52B12 の 11.76〜12.24V (5mA のとき)。
            # 数十 µA では Vz が下がるので、下がり幅を 0〜0.6V と見る。Vbe は 0.5〜0.7V
            lo = (11.76 - 0.6) + 0.5 * (1 + Rs / Rbe)
            hi = 12.24 + 0.7 * (1 + Rs / Rbe)
            # 完全に切れる: Q2 のゲートを 1V (2N7002 の Vth の最小) より下げるのに要るコレクタ電流と、hFE 30 としたベース電流
            ic = (5.0 - 0.5) / rser
            hi_off = hi + (ic / 30) * Rs
            ib15 = (15 - 12.24 - 0.7) / Rs - 0.7 / Rbe
            c.ok("過電圧の遮断: 9V の PD (VIN の最大 9.5V) では必ず入り、15V では必ず切れる", lo > 9.5 + 1.0 and hi_off < 15 - 1.0
                 and ib15 * 30 > ic,
                 f"効きはじめる VIN {lo:.1f}〜{hi:.1f}V、確実に切れるのは {hi_off:.1f}V 以上。"
                 f"15V のときベース電流 {ib15 * 1e3:.2f} mA (要るのは {ic / 30 * 1e3:.3f} mA)")
            vgs_ovp = hi_off * kdiv
            c.ok("Q1: 過電圧の遮断が効く手前 (VIN が最大でも上の値) まで入っていても、Vgs は -12V の中", vgs_ovp < 12 * 0.8,
                 f"昇圧の出力が VIN の素通しで {hi_off:.1f}V になっても Vgs = {-vgs_ovp:.1f}V (最大定格 ±12V。データシートで確認)")
        c.ok("Q3: 1 G = +3V3、3 D = Q2_S、2 S = GND (3.3V が無ければ、Q1 のゲートを引く道が切れて 12V は出ない)",
             c.net("Q3", "1") == "+3V3" and c.net("Q3", "3") == "Q2_S" and c.net("Q3", "2") == "GND"
             and sorted(c.nets["Q2_S"]) == [("Q2", "2"), ("Q3", "3")]
             and sorted(r for r, _ in c.nets["Q2_D"]) == sorted(["Q2", rg[0]]))
        c.ok("F1 (PTC): Q1 の出力 (+12V_SW) と JP2 (+12V_F) の間", set(c.two_pin("F1")) == {"+12V_SW", "+12V_F"}
             and c.net("JP2", "1") == "+12V_F" and c.net("JP2", "2") == "+12V")
        c.ok("+12V の線に GND への抵抗がある (切ったあと 0V まで下げる)", len(c.between("R", "+12V", "GND")) == 1,
             " ".join(c.between("R", "+12V", "GND")))

        # ---- 8. 5V の LDO とマイコン -----------------------------------------
        c.ok("U6: 1 GND、2 VIN、3 VOUT = +5V。入力と出力に 10µF", c.net("U6", "1") == "GND" and c.net("U6", "2") == "VIN"
             and c.net("U6", "3") == "+5V" and c.between("C", "+5V", "GND"))
        mcu = {"9": "+5V", "7": "GND", "1": "VIN_SENSE", "2": "VBUS1_SENSE", "3": "CC1_SENSE", "5": "CC2_SENSE",
               "6": "12V_SENSE", "8": "LED_STAT", "10": "SW1_IN", "11": "I2C1_SDA", "12": "I2C1_SCL", "13": "EN_MCU",
               "14": "PERST_MCU", "15": "I2C2_SCL", "16": "I2C2_SDA", "18": "SWIO", "19": "EN_12V", "20": "SW12_ON"}
        bad = [f"{p}:{c.net('U7', p)}" for p, n in mcu.items() if c.net("U7", p) != n]
        bad += [f"{p}:not NC" for p in ("4", "17") if not c.is_nc("U7", p)]
        c.ok("U7: ピンの割り当てが README の表のとおり (ADC は A7・A5・A6・A1・A0、I2C は PC1/PC2 と PC5/PC6、SWIO は PD1)",
             not bad, " ".join(bad))
        c.ok("J5: 1 = SWIO、2 = GND", c.net("J5", "1") == "SWIO" and c.net("J5", "2") == "GND")
        c.ok("JP7 (開いたはんだジャンパー): マイコンの入力 SW1_IN と GND の間。入力は +5V へプルアップ",
             set(c.two_pin("JP7")) == {"SW1_IN", "GND"} and len(c.between("R", "+5V", "SW1_IN")) == 1)

        # マイコンの ADC の入力が電源電圧を超えないこと
        def vdd(vin):
            return min(5.0, max(0.0, vin - 0.6))   # LDO の降下を大きめ (0.6V) に見る

        for adc, src in (("VIN_SENSE", "VIN"), ("VBUS1_SENSE", "VBUS1"), ("12V_SENSE", "+12V")):
            ra, rb2 = c.between("R", src, adc), c.between("R", adc, "GND")
            k = ohms(c.comps[rb2[0]]["value"]) / (ohms(c.comps[ra[0]]["value"]) + ohms(c.comps[rb2[0]]["value"]))
            worst = max((k * v - vdd(v), v) for v in [x / 10 for x in range(30, 201)])
            c.ok(f"{adc}: {src} が 3〜20V (TVS が抑える上限) のどこでも、ピンの電圧 ≤ マイコンの電源", worst[0] <= 0,
                 f"比 {k:.3f}: 5V->{k * 5:.2f}V, 9V->{k * 9:.2f}V, 20V->{k * 20:.2f}V (電源 5.0V)。余裕の最小 {-worst[0]:.2f}V @ {worst[1]}V")
            c.ok(f"{adc}: {src} からマイコンのピンへは抵抗を通る (直結していない)", "U7" not in {r for r, _ in c.nets[src]})
        for adc, src in (("CC1_SENSE", "J1_CC1"), ("CC2_SENSE", "J1_CC2")):
            rs = c.between("R", src, adc)
            r = ohms(c.comps[rs[0]]["value"])
            c.ok(f"{adc}: {src} から直列の抵抗を通る。CC が 20V に触れても、ピンへ流れ込む電流は 4mA (最大定格) 未満",
                 len(rs) == 1 and (20 - 5) / r < 4e-3 and "U7" not in {x for x, _ in c.nets[src]},
                 f"{rs[0]} {r / 1e3:.0f}kΩ -> {(20 - 5) / r * 1e3:.2f} mA。ふだんの CC は 2.1V 以下")
            c.ok(f"{src} につながるのは端子・PD の IC・直列の抵抗だけ (PD の通信の線にコンデンサを直接ぶら下げない)",
                 sorted(x for x, _ in c.nets[src]) == sorted(["J1", "U1", rs[0]]))

        # ---- 9. PERST# ------------------------------------------------------
        rp, cp = c.between("R", "+3V3", "PERST#"), c.between("C", "PERST#", "GND")
        tau = ohms(c.comps[rp[0]]["value"]) * farads(c.comps[cp[0]]["value"])[0]
        import math
        t2 = -tau * math.log(1 - 2.0 / 3.3)
        c.ok("PERST#: +3V3 へ抵抗、GND へコンデンサ。2.0V に届くまで 100ms 以上 (PCIe の T_PVPERL)", len(rp) == 1 and len(cp) == 1 and t2 >= 0.1,
             f"{rp[0]}·{cp[0]}: τ = {tau * 1e3:.0f} ms、2.0V まで {t2 * 1e3:.0f} ms")
        rser = c.between("R", "PERST_MCU", "PERST#")
        c.ok("PERST#: D6 が抵抗に並列 (3.3V が落ちたらコンデンサをすぐ空にする)。マイコンの PC4 へは直列 1kΩ を通る",
             c.diode("D6") == ("PERST#", "+3V3") and len(rser) == 1 and ohms(c.comps[rser[0]]["value"]) == 1000
             and sorted(c.nets["PERST_MCU"]) == sorted([("U7", "14"), (rser[0], "1")]),
             f"PC4 が Low のとき PERST# = 3.3V × 1k / ({rp[0]} + 1k) = {3.3 * 1000 / (ohms(c.comps[rp[0]]['value']) + 1000):.2f}V (Low の上限 0.8V より下)")
        # PTC: データシート (C7542961) の温度の表。保持電流が 60〜70℃ でも 0.5A を下回らないこと
        ptc = c.comps["F1"]
        hold = {"1206L110/16NR": (1.10, 0.72, 0.66, 16)}.get(ptc["value"])
        c.ok("F1 (PTC): 保持電流 1.1A (25℃)・定格 16V 以上。60℃ / 70℃ でも 0.5A 以上 (データシートの表の値)",
             hold is not None and hold[0] >= 1.0 and hold[2] >= 0.5 and hold[3] >= 16,
             f"{ptc['value']} ({ptc['fields'].get('LCSC')}): 25℃ {hold[0]}A、60℃ {hold[1]}A、70℃ {hold[2]}A、{hold[3]}V" if hold else ptc["value"])

        # ---- 10. コンデンサの耐圧 --------------------------------------------
        need = {"VIN": 25, "VBUS1": 25, "VBUS2": 25, "+12V": 25, "+12V_BOOST": 25, "+12V_SW": 25, "+12V_F": 25,
                "Q1_G": 25}
        low = []
        for ref in c.comps:
            if re.match(r"^C\d+$", ref):
                for n in c.two_pin(ref):
                    if n in need and farads(c.comps[ref]["value"])[1] < need[n]:
                        low.append(ref)
        c.ok("VIN・VBUS・12V の線のコンデンサは耐圧 25V 以上", not low, " ".join(low) or "すべて 25V か 50V")

        # ---- 11. 部品の情報 --------------------------------------------------
        nol = [r for r, d in c.comps.items() if not d["fields"].get("LCSC") and not re.match(r"^(TP|H|JP\d|J5$)", r)]
        c.ok("部品を載せるものには全部 LCSC の品番がある (J4 も載せる)", not nol and c.comps["J4"]["fields"].get("LCSC") == "C492422",
             " ".join(nol) or f"{len(c.comps)} 個中、載せないのは TP・H・はんだジャンパー・1x2 のピンヘッダ (J5・JP1・JP2)")
        nofp = [r for r, d in c.comps.items() if not d["footprint"]]
        c.ok("全部の部品にフットプリントがある", not nofp, " ".join(nofp))
        single = [n for n, nodes in c.nets.items() if len(nodes) == 1 and not n.startswith("unconnected-")]
        c.ok("ピンが 1 つしか乗っていないネットはない (ラベルの書き違いがない)", not single, " ".join(single))
        return self

    def write(self):
        lines = ["# ネットリストの検査 (scripts/check_netlist.py が out/netlist.net を読んで作る)", "",
                 f"部品 {len(self.comps)} 個、ネット {len([n for n in self.nets if not n.startswith('unconnected-')])} 本 "
                 f"(未接続の印のピン {len([n for n in self.nets if n.startswith('unconnected-')])} 本)", ""]
        for st, title, detail in self.rows:
            lines.append(f"[{st}] {title}" + (f"\n       {detail}" if detail else ""))
        lines += ["", f"結果: {len(self.rows)} 項目中 OK {len(self.rows) - self.ng}、NG {self.ng}"]
        with open(os.path.join(ROOT, "out", "netlist_check.txt"), "w", encoding="utf-8", newline="\n") as fh:
            fh.write("\n".join(lines) + "\n")
        print(lines[-1])
        for st, title, detail in self.rows:
            if st == "NG":
                print("NG:", title, "|", detail)


if __name__ == "__main__":
    ck = Checker().run()
    ck.write()
    sys.exit(1 if ck.ng else 0)
