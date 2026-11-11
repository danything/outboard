"""フットプリントのライブラリ (lib/pcie-tuner.pretty, lib/pcie-tuner.3dshapes) を作り、
EasyEDA (JLCPCB) のシンボルのピンと、このプロジェクトのシンボルのピンを突き合わせる。

入力: build/easyeda/ (scripts/fetch_easyeda.sh と convert_easyeda.sh の出力)、KiCad の標準ライブラリ (読むだけ)
出力: lib/pcie-tuner.pretty/*.kicad_mod, lib/pcie-tuner.3dshapes/*.wrl, sym-lib-table, fp-lib-table,
      out/lib_check.txt (突き合わせの結果)

EasyEDA のフットプリントに加える変更 (パッドの位置・大きさ・番号は変えない):
  - コートヤードを、パッドと外形を囲む四角に作り直す (EasyEDA のものは部品の胴体だけで、パッドより小さい)
  - シルクの 1 番ピンの点 (線幅 0.06mm。JLCPCB の最小 0.15mm より細い) を消す。印は make_board.py が付け直す
  - 3D モデルの場所をプロジェクトからの相対にする
  - PCIe スロット: 位置決めの柱の穴を 2.5mm から、データシートの推奨の 2.35mm にする。
    ピンの穴を 0.914mm から 0.8mm に、パッドを 1.524mm から 1.35mm にする (データシートの推奨の穴は 0.70±0.08mm)
  - USB-C: GND と VBUS のパッド (多角形) を、データシートのとおり 0.6 x 1.3mm の四角にする
  - スライドスイッチ: 属性を through_hole から smd にする (パッドは表面実装。位置ファイルに出すため)

使い方: "C:\\Program Files\\KiCad\\10.0\\bin\\python.exe" scripts/build_lib.py
"""
from __future__ import annotations

import os
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sexpr import Str, Sym, dump, find, find_all, parse  # noqa: E402
from parts import EASYEDA_SYMBOL, FP, PARTS  # noqa: E402
import gen_schematic as gs  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "build", "easyeda")
DST = os.path.join(ROOT, "lib", "pcie-tuner.pretty")
DST3D = os.path.join(ROOT, "lib", "pcie-tuner.3dshapes")
KICAD_FP = r"C:\Program Files\KiCad\10.0\share\kicad\footprints"
KICAD_COPY = {
    "TestPoint_Pad_D1.5mm": "TestPoint.pretty",
    "MountingHole_3.2mm_M3": "MountingHole.pretty",
    "SolderJumper-2_P1.3mm_Bridged_RoundedPad1.0x1.5mm": "Jumper.pretty",
}
MARGIN = 0.15


def pad_bbox(p):
    at = find(p, "at")
    x, y = float(at[1]), float(at[2])
    rot = float(at[3]) if len(at) > 3 else 0.0
    sz = find(p, "size")
    w, h = float(sz[1]), float(sz[2])
    if int(round(rot)) % 180 == 90:
        w, h = h, w
    pts = [(x - w / 2, y - h / 2), (x + w / 2, y + h / 2)]
    prim = find(p, "primitives")
    if prim:
        def walk(n):
            for c in n:
                if isinstance(c, list):
                    if c and c[0] == "xy":
                        pts.append((x + float(c[1]), y + float(c[2])))
                    else:
                        walk(c)
        walk(prim)
    return pts


def convert(name):
    t = parse(open(os.path.join(SRC, "easyeda.pretty", name + ".kicad_mod"), encoding="utf-8").read())
    t[1] = Str(name)
    pts = []
    out = []
    for c in t:
        if isinstance(c, list) and c:
            lay = find(c, "layer")
            layer = lay[1] if lay else None
            if c[0] in ("fp_line", "fp_circle", "fp_arc", "fp_poly", "fp_rect") and layer == "F.CrtYd":
                continue
            if c[0] == "fp_circle" and layer == "F.SilkS" and (float(find(c, "width")[1]) < 0.1 or name.startswith("LED")):
                continue
            if c[0] == "pad":
                pts += pad_bbox(c)
                if name.startswith("CONN-TH_36P") and c[2] == "thru_hole" and c[1] == "" and float(find(c, "drill")[1]) == 2.5:
                    find(c, "drill")[1] = Sym("2.35")
                    find(c, "size")[1] = Sym("2.35")
                    find(c, "size")[2] = Sym("2.35")
                    c[2] = Sym("np_thru_hole")
                elif c[2] == "thru_hole" and c[1] == "":
                    c[2] = Sym("np_thru_hole")
                elif name.startswith("CONN-TH_36P") and c[2] == "thru_hole":
                    # EasyEDA は穴 0.914mm・パッド 1.524mm。データシートの推奨の穴は 0.70±0.08mm。
                    # 柱の穴との間隔 (穴と穴 0.45mm、穴と銅 0.2mm) を守るため、穴 0.8mm・パッド 1.35mm にする
                    find(c, "drill")[1] = Sym("0.8")
                    find(c, "size")[1] = Sym("1.35")
                    find(c, "size")[2] = Sym("1.35")
                elif name.startswith("USB-C_SMD") and c[2] == "smd" and c[3] == "custom":
                    # GND と VBUS のパッド: EasyEDA は多角形 (線幅ぶん太って 0.7mm 幅)。
                    # データシートの推奨のとおり 0.6 x 1.3mm の四角にする
                    c[3] = Sym("rect")
                    find(c, "size")[1] = Sym("0.6")
                    find(c, "size")[2] = Sym("1.3")
                    c[:] = [x for x in c if not (isinstance(x, list) and x and x[0] in ("primitives", "options"))]
            if c[0] == "fp_line" and layer in ("F.SilkS", "F.Fab"):
                for k in ("start", "end"):
                    e = find(c, k)
                    pts.append((float(e[1]), float(e[2])))
            if c[0] == "attr" and name.startswith("SW-TH"):
                c[1] = Sym("smd")
            if c[0] == "model":
                base = os.path.basename(str(c[1]))
                shutil.copyfile(os.path.join(SRC, "easyeda.3dshapes", base), os.path.join(DST3D, base))
                c[1] = Str("${KIPRJMOD}/lib/pcie-tuner.3dshapes/" + base)
        out.append(c)
    x1 = min(p[0] for p in pts) - MARGIN
    x2 = max(p[0] for p in pts) + MARGIN
    y1 = min(p[1] for p in pts) - MARGIN
    y2 = max(p[1] for p in pts) + MARGIN
    for a, b in (((x1, y1), (x2, y1)), ((x2, y1), (x2, y2)), ((x2, y2), (x1, y2)), ((x1, y2), (x1, y1))):
        out.insert(-1, [Sym("fp_line"), [Sym("start"), round(a[0], 3), round(a[1], 3)],
                        [Sym("end"), round(b[0], 3), round(b[1], 3)], [Sym("layer"), Sym("F.CrtYd")],
                        [Sym("width"), 0.05]])
    with open(os.path.join(DST, name + ".kicad_mod"), "w", encoding="utf-8", newline="\n") as fh:
        fh.write(dump(out) + "\n")
    return len(find_all(out, "pad")), (round(x2 - x1, 2), round(y2 - y1, 2))


def easyeda_pins():
    t = parse(open(os.path.join(SRC, "easyeda.kicad_sym"), encoding="utf-8").read())
    res = {}
    for s in find_all(t, "symbol"):
        pins = {}
        for sub in find_all(s, "symbol"):
            for p in find_all(sub, "pin"):
                pins[str(find(p, "number")[1])] = str(find(p, "name")[1])
        props = {str(p[1]): str(p[2]) for p in find_all(s, "property")}
        res[str(s[1])] = (pins, props.get("Footprint", ""))
    return res


def norm(s):
    return s.upper().replace(" ", "").replace("_", "").replace("(EP)", "")


def check_symbols(report):
    """各部品について、EasyEDA のシンボル (番号 -> 名前) と自前のシンボルを比べる。"""
    ee = easyeda_pins()
    bad = 0
    symof = {"USBC": "USB_C_16P", "PCIE": "PCIE_X1", "HDR10": "HDR_2x5", "HDR2": "HDR_1x2", "CH224A": "CH224A",
             "TPS62933": "TPS62933", "MT3608B": "MT3608B", "SRV05": "SRV05-4", "HT7550": "HT7550-1",
             "CH32V003": "CH32V003F4P6", "AO3407A": "PMOS_GSD", "2N7002": "NMOS_GSD", "MSK12C02": "SW_SPDT"}
    for key, p in PARTS.items():
        lc = p.get("lcsc")
        if lc not in EASYEDA_SYMBOL:
            continue
        epins, efp = ee[EASYEDA_SYMBOL[lc]]
        efp = efp.split(":")[-1]
        line = [f"{key} ({lc}): EasyEDA footprint {efp}"]
        if efp != FP[p["fp"]]:
            bad += 1
            line.append(f"  NG footprint differs from ours: {FP[p['fp']]}")
        if key in symof:
            _w, _t, _n, pins = gs.box_geometry(symof[key])
            ours = {num: v[3] for num, v in pins.items()}
            if set(ours) != set(epins):
                bad += 1
                line.append(f"  NG pin numbers differ: ours {sorted(ours)} / EasyEDA {sorted(epins)}")
            for num in sorted(set(ours) & set(epins)):
                a, b = norm(ours[num]), norm(epins[num])
                # 番号だけのシンボル (ヘッダ・SRV05・スイッチ・スロット) は名前を比べない
                generic = b == num or b in ("EH",) or key in ("HDR10", "HDR2", "PCIE", "SRV05", "MSK12C02")
                same = generic or a == b or b.startswith(a.split("/")[0]) or a.startswith(b) \
                    or (key == "USBC" and a == "SHELL") or (key == "HT7550" and a == b.upper())
                if not same:
                    bad += 1
                line.append(f"  pin {num:>5}: ours {ours[num]:<12} EasyEDA {epins[num]:<40} {'ok' if same else 'NG'}"
                            + (" (EasyEDA has no name; checked against the datasheet by hand)" if generic and key != "USBC" else ""))
        elif "sym" in p:
            a_pad = [n for n, nm in epins.items() if nm.upper() in ("A", "+")][0]
            k_pad = [n for n, nm in epins.items() if nm.upper() in ("K", "-", "C")][0]
            want = f"A{a_pad}K{k_pad}" if a_pad == "1" else f"K{k_pad}A{a_pad}"
            ok = p["sym"].endswith(want)
            bad += 0 if ok else 1
            line.append(f"  EasyEDA: anode = pad {a_pad}, cathode = pad {k_pad}; our symbol {p['sym']} {'ok' if ok else 'NG'}")
        else:
            line.append(f"  2 pins, no polarity: {epins}")
        report.append("\n".join(line))
    return bad


def main():
    os.makedirs(DST, exist_ok=True)
    os.makedirs(DST3D, exist_ok=True)
    os.makedirs(os.path.join(ROOT, "out"), exist_ok=True)
    report = ["# lib_check: footprints and symbol pins (generated by scripts/build_lib.py)", ""]
    for short, name in FP.items():
        if name in KICAD_COPY:
            shutil.copyfile(os.path.join(KICAD_FP, KICAD_COPY[name], name + ".kicad_mod"),
                            os.path.join(DST, name + ".kicad_mod"))
            report.append(f"footprint {name}: copied from KiCad {KICAD_COPY[name]}")
        else:
            n, size = convert(name)
            report.append(f"footprint {name}: from EasyEDA, {n} pads, courtyard {size[0]} x {size[1]} mm")
    report.append("")
    bad = check_symbols(report)
    report.append("")
    report.append(f"RESULT: {'OK' if bad == 0 else 'NG'} ({bad} mismatches)")
    with open(os.path.join(ROOT, "out", "lib_check.txt"), "w", encoding="utf-8", newline="\n") as fh:
        fh.write("\n".join(report) + "\n")
    with open(os.path.join(ROOT, "sym-lib-table"), "w", encoding="utf-8", newline="\n") as fh:
        fh.write('(sym_lib_table\n\t(version 7)\n\t(lib (name "pcie-tuner")(type "KiCad")'
                 '(uri "${KIPRJMOD}/lib/pcie-tuner.kicad_sym")(options "")(descr "pcie-tuner-board symbols"))\n)\n')
    with open(os.path.join(ROOT, "fp-lib-table"), "w", encoding="utf-8", newline="\n") as fh:
        fh.write('(fp_lib_table\n\t(version 7)\n\t(lib (name "pcie-tuner")(type "KiCad")'
                 '(uri "${KIPRJMOD}/lib/pcie-tuner.pretty")(options "")(descr "pcie-tuner-board footprints"))\n)\n')
    print(report[-1])
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
