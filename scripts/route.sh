#!/bin/sh
# 細い信号の自動配線。freerouting 2.5.0 を Linux のコンテナ (wslc) の中で動かす。手元の PC では動かさない。
#
# 入力: build/route.dsn (scripts/export_dsn.py が作る)
# 出力: build/route.ses  (scripts/finish_board.py が取り込む)
# 道具: build/freerouting-2.5.0.jar
#   https://github.com/freerouting/freerouting/releases/download/v2.5.0/freerouting-2.5.0.jar
#   sha256 f6f51bb02245e8e717f9359bd260cc9c5c0b1bc0acc8b7cb2cd5b8ffeb5de3c7
# コンテナのイメージ: eclipse-temurin:25-jre
#
# 使い方: sh scripts/route.sh   (リポジトリの根で。Git Bash)
set -eu
cd "$(dirname "$0")/.."
JAR=freerouting-2.5.0.jar
SUM=f6f51bb02245e8e717f9359bd260cc9c5c0b1bc0acc8b7cb2cd5b8ffeb5de3c7
if [ ! -s "build/$JAR" ]; then
  curl -sSL -o "build/$JAR" "https://github.com/freerouting/freerouting/releases/download/v2.5.0/$JAR"
fi
echo "$SUM *build/$JAR" | sha256sum -c -
rm -f build/route.ses
export MSYS_NO_PATHCONV=1
wslc run --rm -v "$(cygpath -w "$PWD/build"):/w" -w /w eclipse-temurin:25-jre sh -c "
  java -Djava.awt.headless=true -jar /w/$JAR -de /w/route.dsn -dr /w/route.rules -do /w/route.ses --router.autorouter.max_passes=${PASSES:-40} --router.autorouter.ignore_net_classes=GND --router.copperToEdgeClearanceUm=450 \
    --gui.enabled=false --user_data_path=/tmp/fr 2>&1 | tail -n ${TAIL:-25}
"
ls -la build/route.ses
# 結果をリポジトリに残す (自動配線は毎回少し違う結果を出すので、検査を通ったものを取っておく)
mkdir -p routing && cp build/route.ses routing/route.ses
