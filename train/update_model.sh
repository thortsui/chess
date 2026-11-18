#!/bin/bash
# 把 DGX 最新訓練的權重換進遊戲並推上 git：bash train/update_model.sh
set -e
cd "$(dirname "$0")/.."
scp -q dgx:projects/chess-ai/repo/runs/model/model.bin dgx:projects/chess-ai/repo/runs/model/model.json ai/
node ai/test/net_check.js ai | head -1
STEPS=$(ssh dgx 'docker logs chess-selfplay 2>&1 | grep 估值 | tail -1' | sed -n 's/.*訓練 \([0-9]*\) 步.*/\1/p')
V=$(PYTHONUTF8=1 python3 tools/bump_version.py fix | sed 's/.*→ //')
sed -i "s/APPV='[^']*'/APPV='$V'/; s/V='dzxq-[^']*'/V='dzxq-ai${V//./}'/" sw.js
DAY=$(date +%F)
grep -q "^## $DAY" docs/工作日誌.md || printf '\n## %s\n\n' "$DAY" >> docs/工作日誌.md
printf -- "- %s \`%s\` 更新下棋模型（DGX 自我對弈，這次重啟後已訓練 %s 步）\n" "$(date +%H:%M)" "$V" "${STEPS:-?}" >> docs/工作日誌.md
git add ai/model.bin ai/model.json sw.js index.html app docs
git commit -q -m "更新下棋模型（DGX 自我對弈訓練） ($V)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
GIT_TERMINAL_PROMPT=0 git push -q && echo "已推上 git：$V"
