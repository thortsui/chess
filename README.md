#對坐象棋

手機直式網頁象棋，單一檔案 `index.html`，可直接放上 GitHub Pages。

- **單機對戰**：同一支手機，兩人面對面下（黑方畫面倒轉）。
- **和 AI 對戰**：滑動條 Lv 1–10 調整強度，運算在玩家自己的手機上進行。
- **連線對戰**：創建房間取得 4 位數房號，朋友輸入房號加入。房主執紅並負責判定棋步，連線透過 PeerJS 點對點傳輸。

## 上線

Settings → Pages → Source 選 `Deploy from a branch`，Branch 選 `main`、資料夾 `/ (root)`，存檔後約一分鐘可在
`https://thortsui.github.io/chess/` 開啟。
