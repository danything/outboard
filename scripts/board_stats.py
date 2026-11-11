"""基板の配線の量をまとめて表示する (自動配線の結果を比べるための道具)。

使い方: python scripts/board_stats.py [基板のファイル]
"""
import os
import sys

import pcbnew

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def stats(path):
    b = pcbnew.LoadBoard(path)
    ln = {pcbnew.F_Cu: 0.0, pcbnew.B_Cu: 0.0}
    vias = 0
    bot = {}
    for t in b.GetTracks():
        if t.Type() == pcbnew.PCB_VIA_T:
            vias += 1
            continue
        L = pcbnew.ToMM(t.GetLength())
        ln[t.GetLayer()] = ln.get(t.GetLayer(), 0) + L
        if t.GetLayer() == pcbnew.B_Cu:
            bot[t.GetNetname()] = bot.get(t.GetNetname(), 0) + L
    return ln, vias, bot


if __name__ == "__main__":
    p = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "pcie-tuner-board.kicad_pcb")
    ln, vias, bot = stats(p)
    print(f"F.Cu {ln[pcbnew.F_Cu]:.0f} mm, B.Cu {ln[pcbnew.B_Cu]:.0f} mm, vias {vias}")
    print("B.Cu by net:", ", ".join(f"{k.lstrip('/')} {v:.0f}" for k, v in sorted(bot.items(), key=lambda kv: -kv[1])))
