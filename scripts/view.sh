#!/bin/sh
# 基板を PDF に書き出して目で見るための道具 (紙の大きさは基板に合わせてある)。
# 使い方: sh scripts/view.sh <基板のファイル> <出力の名前 (拡張子なし)> [レイヤーの一覧]
set -eu
KC="/c/Program Files/KiCad/10.0/bin/kicad-cli.exe"
IN="$1"
OUT="$2"
LAYERS="${3:-F.Cu,F.SilkS,F.CrtYd,Edge.Cuts}"
"$KC" pcb export pdf --mode-single -l "$LAYERS" --scale 1 -o "$OUT.pdf" "$IN" >/dev/null
echo "$OUT.pdf"
