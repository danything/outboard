#!/bin/sh
# 全部を作り直す。リポジトリの根で: sh scripts/build_all.sh [段]
#   lib      : EasyEDA のデータの取得と変換 (ネットワークとコンテナを使う。lib/ がすでにあれば要らない)
#   sch      : プロジェクトファイル・ライブラリ・回路図・ERC・ネットリスト・ネットリストの検査
#   board    : 配置と手配線 -> 自動配線 (コンテナ) -> 仕上げ
#   check    : DRC (回路図との一致つき) と基板の検査
#   out      : fab/ と out/ の書き出し
# 段を省くと sch board check out を順に実行する。
set -eu
cd "$(dirname "$0")/.."
PY="/c/Program Files/KiCad/10.0/bin/python.exe"
KC="/c/Program Files/KiCad/10.0/bin/kicad-cli.exe"
export PYTHONIOENCODING=utf-8
STAGES="${*:-sch board check out}"
for s in $STAGES; do
  case "$s" in
    lib)
      sh scripts/fetch_easyeda.sh
      sh scripts/convert_easyeda.sh
      ;;
    sch)
      "$PY" scripts/gen_project.py
      "$PY" scripts/build_lib.py
      "$PY" scripts/gen_schematic.py
      "$KC" sch upgrade pcie-tuner-board.kicad_sch
      "$KC" sch erc --severity-all --units mm --exit-code-violations -o out/erc.rpt pcie-tuner-board.kicad_sch
      "$KC" sch export netlist --format kicadsexpr -o out/netlist.net pcie-tuner-board.kicad_sch
      "$PY" scripts/check_netlist.py
      ;;
    board)
      "$PY" scripts/make_board.py
      "$PY" scripts/export_dsn.py
      sh scripts/route.sh
      "$PY" scripts/finish_board.py
      ;;
    check)
      "$KC" pcb drc --severity-all --schematic-parity --units mm -o out/drc.rpt pcie-tuner-board.kicad_pcb
      "$PY" scripts/drc_summary.py out/drc.rpt
      "$PY" scripts/check_board.py
      ;;
    out)
      "$PY" scripts/export_fab.py
      ;;
    *) echo "unknown stage $s"; exit 1 ;;
  esac
done
