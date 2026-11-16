# 建置流程

原始碼是單一檔案 `xiangqi.html`（Claude 網頁版，連線用 Claude 的 room 功能）。GitHub／App 版由這裡的腳本轉出：

1. `gh_build.py`：把 room 連線換成 PeerJS（`peer_online.js` 給棋類、`pk_net_peer.js` 給撲克牌），把內嵌的 3D 模型拆成 `models/*.glb`，輸出到 `/home/claude/gh/index.html`。
2. `pwa_build.py`：把外部程式庫、字體改成本地檔，加上安裝提示、`manifest.webmanifest`、`sw.js` 離線快取，輸出到 repo 根目錄。
3. iOS App：`cd app && node build-www.mjs && npx cap sync ios`（雲端 Mac 由 `.github/workflows/ios.yml` 執行）。

腳本裡的路徑是開發環境的絕對路徑，換環境時要調整。
