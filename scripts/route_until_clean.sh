#!/bin/sh
# 自動配線は実行のたびに結果が変わり、1 本つなぎ残す回がある。DRC が 0 になるまで (最大 N 回) やり直す。
# 通った結果は routing/route.ses に残る (route.sh が写す)。
# 使い方: sh scripts/route_until_clean.sh [回数 (既定 6)]
set -u
cd "$(dirname "$0")/.."
PY="/c/Program Files/KiCad/10.0/bin/python.exe"
KC="/c/Program Files/KiCad/10.0/bin/kicad-cli.exe"
export PYTHONIOENCODING=utf-8
N="${1:-6}"
i=1
while [ "$i" -le "$N" ]; do
  "$PY" scripts/make_board.py >/dev/null || exit 1
  "$PY" scripts/export_dsn.py >/dev/null || exit 1
  TAIL=3 sh scripts/route.sh >/dev/null 2>&1
  "$PY" scripts/finish_board.py >/dev/null 2>&1
  "$KC" pcb drc --severity-all --schematic-parity --units mm -o out/drc.rpt pcie-tuner-board.kicad_pcb >/dev/null 2>&1
  s=$("$PY" scripts/drc_summary.py out/drc.rpt | tail -1)
  echo "try $i: [$s]"
  if [ -z "$s" ]; then
    echo "clean"
    exit 0
  fi
  i=$((i + 1))
done
"$PY" scripts/drc_summary.py out/drc.rpt all | cut -c1-220 | head -12
exit 1
