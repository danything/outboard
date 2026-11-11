#!/bin/sh
# build/easyeda/.easyeda_cache/ のデータを、コンテナの中の easyeda2kicad 1.0.1 で
# KiCad のシンボル・フットプリント・3D モデルに変換する (ネットワークは pip の取得にだけ使う)。
# 出力: build/easyeda/easyeda.kicad_sym, easyeda.pretty/, easyeda.3dshapes/
# 使い方: sh scripts/convert_easyeda.sh   (リポジトリの根で。Git Bash)
set -eu
cd "$(dirname "$0")/.."
PARTS=$(grep -v '^#' scripts/lcsc_parts.txt | awk '{print $1}' | tr '\n' ' ')
export MSYS_NO_PATHCONV=1
wslc run --rm -v "$(cygpath -w "$PWD/build/easyeda"):/w" -w /w python:3.13-slim sh -c "
pip install --quiet --root-user-action=ignore easyeda2kicad==1.0.1 2>&1 | grep -v notice
for p in $PARTS; do
  if [ -s /w/.easyeda_cache/\$p.json ]; then
    easyeda2kicad --full --use-cache --overwrite --lcsc_id=\$p --output /w/easyeda 2>&1 | grep -v -e '^-- easyeda2kicad' | sed \"s/^/\$p: /\"
  else
    echo \"\$p: (cache なし。fetch_easyeda.sh を先に)\"
  fi
done
ls /w/easyeda.pretty | wc -l
"
