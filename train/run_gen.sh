#!/bin/bash
# 在 DGX 上平行產生訓練資料：bash train/run_gen.sh <game> <行程數> <每個行程的局數> [老師最短ms] [老師最長ms]
# 輸出到 data/<game>/<時間>_<編號>.bin，log 在 data/<game>/gen.log
set -e
cd "$(dirname "$0")/.."
G=$1; P=${2:-18}; N=${3:-50}; TMIN=${4:-60}; TMAX=${5:-250}
NODE=${NODE:-$HOME/tools/node/bin/node}
mkdir -p data/$G
TAG=$(date +%m%d%H%M%S)
for i in $(seq 1 $P); do
  $NODE train/gen.js $G $N $RANDOM$i data/$G/${TAG}_$i.bin $TMIN $TMAX >> data/$G/gen.log 2>&1 &
done
wait
echo "[$G] 完成 $(date)" >> data/$G/gen.log
