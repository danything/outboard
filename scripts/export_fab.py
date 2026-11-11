"""JLCPCB に出すファイル (fab/) と、見るためのファイル (out/) を書き出す。

fab/gerber/                    ガーバーとドリル (zip の中身)
fab/pcie-tuner-board-gerber.zip  JLCPCB の「Add gerber file」に上げる
fab/bom.csv                    Comment, Designator, Footprint, LCSC Part #
fab/cpl.csv                    Designator, Mid X, Mid Y, Layer, Rotation
out/schematic.pdf, out/board-top.png, out/board-bottom.png, out/board-layers.pdf, out/assembly-top.pdf

部品の位置 (cpl.csv) の回転: フットプリントは EasyEDA (JLCPCB のライブラリ) のものをそのまま使っているので、
KiCad の角度をそのまま出している (補正は 0)。JLCPCB の画面の部品の配置の絵で、1 つずつ向きを確かめること。

使い方: "C:\\Program Files\\KiCad\\10.0\\bin\\python.exe" scripts/export_fab.py
"""
from __future__ import annotations

import csv
import glob
import os
import re
import subprocess
import sys
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from check_netlist import load  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KC = r"C:\Program Files\KiCad\10.0\bin\kicad-cli.exe"
PCB = os.path.join(ROOT, "pcie-tuner-board.kicad_pcb")
SCH = os.path.join(ROOT, "pcie-tuner-board.kicad_sch")


def run(*args):
    r = subprocess.run([KC, *args], capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode:
        print(r.stdout, r.stderr)
        raise SystemExit(f"kicad-cli failed: {' '.join(args[:3])}")


def natural(ref):
    m = re.match(r"([A-Za-z]+)(\d+)", ref)
    return (m.group(1), int(m.group(2)))


def main():
    fab, out, ger = os.path.join(ROOT, "fab"), os.path.join(ROOT, "out"), os.path.join(ROOT, "fab", "gerber")
    os.makedirs(ger, exist_ok=True)
    for f in glob.glob(os.path.join(ger, "*")):
        os.remove(f)
    # ---- ガーバーとドリル ------------------------------------------------------
    run("pcb", "export", "gerbers", "-o", ger + os.sep,
        "-l", "F.Cu,B.Cu,F.Paste,B.Paste,F.SilkS,B.SilkS,F.Mask,B.Mask,Edge.Cuts",
        "--subtract-soldermask", "--no-x2", "--no-netlist", PCB)
    run("pcb", "export", "drill", "-o", ger + os.sep, "--format", "excellon", "--excellon-units", "mm",
        "--excellon-separate-th", "--drill-origin", "absolute", "--excellon-zeros-format", "decimal", PCB)
    for f in glob.glob(os.path.join(ger, "*.gbrjob")):
        os.remove(f)
    zpath = os.path.join(fab, "pcie-tuner-board-gerber.zip")
    with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED) as z:
        for f in sorted(glob.glob(os.path.join(ger, "*"))):
            z.write(f, os.path.basename(f))
    # ---- BOM -------------------------------------------------------------------
    comps, _nets, _pin, _func = load()
    groups = {}
    for ref, c in comps.items():
        lcsc = c["fields"].get("LCSC", "")
        if not lcsc:
            continue        # 部品を載せないもの (テストポイント・穴・はんだジャンパー)
        key = (c["fields"].get("MPN", "") + " " + c["value"] if c["fields"].get("MPN", "") != c["value"] else c["value"],
               c["footprint"].split(":")[-1], lcsc)
        groups.setdefault(key, []).append(ref)
    with open(os.path.join(fab, "bom.csv"), "w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["Comment", "Designator", "Footprint", "LCSC Part #"])
        for key in sorted(groups, key=lambda k: natural(sorted(groups[k], key=natural)[0])):
            w.writerow([key[0], ",".join(sorted(groups[key], key=natural)), key[1], key[2]])
    # ---- 部品の位置 --------------------------------------------------------------
    tmp = os.path.join(ROOT, "build", "pos.csv")
    run("pcb", "export", "pos", "-o", tmp, "--format", "csv", "--units", "mm", "--side", "front",
        "--exclude-dnp", PCB)
    n = 0
    with open(tmp, encoding="utf-8") as fi, open(os.path.join(fab, "cpl.csv"), "w", encoding="utf-8", newline="") as fo:
        w = csv.writer(fo)
        w.writerow(["Designator", "Mid X", "Mid Y", "Layer", "Rotation"])
        rows = [r for r in csv.DictReader(fi) if comps.get(r["Ref"], {}).get("fields", {}).get("LCSC")]
        for r in sorted(rows, key=lambda r: natural(r["Ref"])):
            w.writerow([r["Ref"], f'{float(r["PosX"]):.4f}mm', f'{float(r["PosY"]):.4f}mm', "Top",
                        f'{float(r["Rot"]) % 360:.0f}'])
            n += 1
    # ---- 見るためのファイル ------------------------------------------------------
    run("sch", "export", "pdf", "-o", os.path.join(out, "schematic.pdf"), SCH)
    run("pcb", "render", "-o", os.path.join(out, "board-top.png"), "--side", "top", "-w", "2400", "-h", "1300",
        "--background", "opaque", "--quality", "basic", PCB)
    run("pcb", "render", "-o", os.path.join(out, "board-bottom.png"), "--side", "bottom", "-w", "2400", "-h", "1300",
        "--background", "opaque", "--quality", "basic", PCB)
    run("pcb", "export", "pdf", "--mode-multipage", "-o", os.path.join(out, "board-layers.pdf"),
        "-l", "F.Cu,B.Cu,F.SilkS,F.Mask", "--cl", "Edge.Cuts", PCB)
    run("pcb", "export", "pdf", "--mode-single", "-o", os.path.join(out, "assembly-top.pdf"),
        "-l", "F.Fab,F.SilkS,F.CrtYd,Edge.Cuts", PCB)
    print(f"gerber files {len(glob.glob(os.path.join(ger, '*')))}, bom lines {len(groups)}, "
          f"parts to place {n}, zip {os.path.getsize(zpath)} bytes")


if __name__ == "__main__":
    main()
