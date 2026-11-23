#!/usr/bin/env bash
# 狼人殺迷你發言模型：在 DGX 上跑自我對弈循環到指定時間（0.29.2，Ethan 2026-11-24：「用 DGX 讓他自己跟自己互相玩、把目前的訓練資料也導入，訓練到晚上八點」）
# 在 DGX 本機執行：bash dgx_selfplay.sh <工作資料夾> "<截止時間，例如 2026-11-24 20:00>"
# 工作資料夾要先放好（筆電準備好用 scp 上傳）：
#   code/   repo 的子集：train/ww/mini/*、tools/ww_engine.js、ai/ww/mini.js、ai/ww/tiny/
#   data/   vm.json（詞表）、teacher.jsonl（老師資料）、multi1.jsonl（多模型多人設素材）、ckpt0.pt（目前遊戲用的模型的權重）
#   run/orig.jsonl  每輪都混進去的原本資料抽樣（0.8B 資料、自我對弈第 1 輪挑出的發言）
# 跑在容器 ww-sp 裡（NGC PyTorch 映像＋DGX 上現成的 node），限制記憶體 10 GB、16 核，不碰其他容器（vllm-gamer-27b-ft 是 Ethan 別的工作）。
# 到截止時間整個容器自動停止（做到一半的那輪作廢，已經變強的版本都留著）。進度：<工作資料夾>/run/loop.log；提早停：touch <工作資料夾>/run/STOP
set -eu
W=$(cd "${1:?工作資料夾}" && pwd); UNTIL=$(date -d "${2:?截止時間}" +%s); SECS=$((UNTIL-$(date +%s)))
[ "$SECS" -gt 600 ] || { echo "截止時間太近"; exit 1; }
NODE_DIR=${WW_NODE_DIR:-$HOME/projects/ww-talk/bin}
mkdir -p "$W/home"
docker rm -f ww-sp >/dev/null 2>&1 || true
docker run -d --name ww-sp --gpus all --ipc=host --memory 10g --cpus 16 -u "$(id -u):$(id -g)" \
  -e HOME=/w/home -e PYTHONUTF8=1 -e WW_UNTIL="$UNTIL" \
  -e WW_VOCAB=/w/data/vm.json -e WW_DATA=/w/data -e WW_CKPT0=/w/data/ckpt0.pt -e WW_DEV=cuda -e WW_TOKB=16000 \
  -e WW_PREP_EXTRA="T:/w/data/teacher.jsonl T:/w/data/multi1.jsonl" -e WW_ABP=14 -e WW_ABN=45 \
  -v "$W":/w -v "$NODE_DIR":/nb:ro -w /w/code nvcr.io/nvidia/pytorch:26.01-py3 \
  bash -c "export PATH=/nb:\$PATH; timeout $SECS bash train/ww/mini/selfplay_loop.sh /w/run ${WW_GAMES:-2100} ${WW_PROCS:-14} > /w/run/run.out 2>&1"
echo "已啟動 ww-sp，$(date -d @"$UNTIL" '+%m-%d %H:%M') 自動停止"
