#!/bin/sh
# EasyEDA の公開 API から、LCSC の品番ごとの CAD データ (JSON) と 3D モデルを取ってきて、
# easyeda2kicad の --use-cache が読む形 (.easyeda_cache/) に置く。
#
# easyeda2kicad 自身の取得 (Python の urllib) は 2026-11-11 の時点で 403 になるので、
# 取得だけを素の curl (User-Agent は curl のまま) で行い、変換はコンテナの中でオフラインで行う。
# 使い方: sh scripts/fetch_easyeda.sh   (リポジトリの根で)
set -eu
cd "$(dirname "$0")/.."
CACHE=build/easyeda/.easyeda_cache
mkdir -p "$CACHE"
PARTS=$(grep -v '^#' scripts/lcsc_parts.txt | awk '{print $1}')
for p in $PARTS; do
  f="$CACHE/$p.json"
  if [ ! -s "$f" ]; then
    curl -sS --fail -o "$f" "https://easyeda.com/api/products/$p/components" || { echo "FAIL $p"; rm -f "$f"; continue; }
    sleep 8
  fi
  # 3D モデルの uuid (フットプリントの SVGNODE の中)
  uuid=$(grep -o 'SVGNODE~{[^}]*' "$f" | grep -o '\\"uuid\\":\\"[0-9a-f]*' | head -1 | grep -o '[0-9a-f]*$' || true)
  [ -n "$uuid" ] || uuid=$(grep -o '"uuid": *"[0-9a-f]*"' "$f" | sed -n 's/.*"\([0-9a-f]\{32\}\)"/\1/p' | sed -n 3p || true)
  echo "$p json=$(wc -c < "$f") model=$uuid"
  if [ -n "$uuid" ]; then
    [ -s "$CACHE/$uuid.obj" ] || { curl -sS --fail -o "$CACHE/$uuid.obj" "https://modules.easyeda.com/3dmodel/$uuid" || rm -f "$CACHE/$uuid.obj"; sleep 8; }
    [ -s "$CACHE/$uuid.step" ] || { curl -sS --fail -o "$CACHE/$uuid.step" "https://modules.easyeda.com/qAxj6KHrDKw4blvCG8QJPs7Y/$uuid" || rm -f "$CACHE/$uuid.step"; sleep 8; }
  fi
done
