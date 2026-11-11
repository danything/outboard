"""kicad-cli の DRC のレポートを、種類ごとに短くまとめて表示する (配置と配線を直すときの道具)。

使い方: python scripts/drc_summary.py <レポート> [種類の名前 ...]   (種類を省くと件数だけ)
"""
import re
import sys

OX, OY = 20.0, 20.0


def main():
    path = sys.argv[1]
    kinds = sys.argv[2:]
    txt = open(path, encoding="utf-8").read()
    blocks = re.split(r"\n(?=\[)", txt)
    count = {}
    for b in blocks:
        m = re.match(r"\[(\w+)\]: (.*)", b)
        if not m:
            continue
        k = m.group(1)
        count[k] = count.get(k, 0) + 1
        if k in kinds or "all" in kinds:
            lines = b.strip().split("\n")
            head = lines[0]
            m2 = re.search(r"現状 ([\d.]+)", head)
            items = []
            for ln in lines[2:]:
                m3 = re.match(r"\s+@\(([\d.-]+) mm, ([\d.-]+) mm\): (.*)", ln)
                if m3:
                    x, y = float(m3.group(1)) - OX, float(m3.group(2)) - OY
                    items.append(f"({x:.2f},{y:.2f}) {m3.group(3)[:70]}")
            print(f"{k}{' ' + m2.group(1) if m2 else ''}: " + " | ".join(items))
    print(" ".join(f"{k}={v}" for k, v in sorted(count.items())))


if __name__ == "__main__":
    main()
