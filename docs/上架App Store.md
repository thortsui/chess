# 對坐象棋：上架 App Store 步驟

這份文件說明已經準備好的部分，以及你要親自完成的步驟。照順序做即可，不需要 Mac。

## 已經準備好的部分

| 項目 | 位置 | 說明 |
|---|---|---|
| iOS 專案 | `app/ios/` | 用 Capacitor（把網頁包成原生 App 的開源工具）產生，網頁、字體、3D 模型都打包在 App 裡，完全離線可玩 |
| App 版網頁 | `app/build-www.mjs` | 從網站的 `index.html` 複製一份，拿掉「安裝成 App」提示，震動改用 iPhone 的觸覺回饋 |
| App 圖示 | `app/ios/App/App/Assets.xcassets/AppIcon.appiconset/` | 1024×1024「帥」字圖示 |
| 啟動畫面 | `Splash.imageset/` | 淺灰底加小棋子 |
| 雲端打包 | `.github/workflows/ios.yml` | GitHub 提供的雲端 Mac 每次推送都會編譯檢查；手動執行可簽章並上傳到 App Store Connect |
| 隱私權政策 | `privacy.html` | 網址 <https://thortsui.github.io/chess/privacy.html> |
| 商店截圖 | `app/store/screenshots/` | 7 張 1320×2868（6.9 吋 iPhone 規格，App Store 會自動縮給其他尺寸用）|

App 設定：

- 套件 ID（Bundle ID）：`com.haoaifuture.xiangqi`
- 顯示名稱：對坐象棋
- 只支援 iPhone、只能直向（不支援 iPad，所以不需要 iPad 截圖）
- 最低 iOS 15
- 加密聲明已設為「不使用非豁免加密」，上傳後不會再問出口合規問題

## 你要做的步驟

### 1. 加入 Apple Developer Program（年費 US$99）

到 <https://developer.apple.com/programs/enroll/> 用你的 Apple ID 申請。有兩種身分：

- **以公司名義（建議）**：App Store 上的開發者會顯示「昊智未來科技有限公司」。需要公司的 D-U-N-S 編號（鄧白氏編碼，免費申請，Apple 申請頁有查詢與申請連結，約 1–2 週），以及公司網站 haoaifuture.com。Apple 會打電話確認你有權代表公司。
- **以個人名義**：當天就能開通，App Store 上顯示你的本名。

審核通過後，到 <https://developer.apple.com/account> 的「會員資格詳細資訊」記下 **Team ID**（10 碼英數字）。

### 2. 在 App Store Connect 建立 App

<https://appstoreconnect.apple.com> →「App」→「＋」→「新增 App」：

- 平台：iOS
- 名稱：對坐象棋（若已被用走，可改成「對坐象棋：五合一棋盤」等）
- 主要語言：繁體中文
- 套件 ID：選 `com.haoaifuture.xiangqi`（若下拉選單沒有，先到 developer.apple.com →「Identifiers」→「＋」→「App IDs」新增這個 ID）
- SKU：`duizuo-xiangqi`

### 3. 建立上傳用金鑰

App Store Connect →「使用者與存取權限」→「整合」→「App Store Connect API」→「團隊金鑰」→「＋」：

- 名稱：GitHub 上傳
- 存取權：**App 管理**

建立後記下 **Issuer ID** 與 **金鑰 ID**，並按「下載 API 金鑰」取得 `AuthKey_XXXXXXXXXX.p8`。這個檔只能下載一次，請保存好，也不要傳給別人。

### 4. 把 4 個值存進 GitHub

<https://github.com/thortsui/chess/settings/secrets/actions> →「New repository secret」，逐一新增（需要 repo 擁有者 thortsui 的帳號）：

| 名稱 | 內容 |
|---|---|
| `APPLE_TEAM_ID` | 步驟 1 的 Team ID |
| `ASC_ISSUER_ID` | 步驟 3 的 Issuer ID |
| `ASC_KEY_ID` | 步驟 3 的金鑰 ID |
| `ASC_KEY_P8` | 用文字編輯器打開 `.p8` 檔，整個內容（含 BEGIN／END 那兩行）貼上 |

### 5. 打包上傳

<https://github.com/thortsui/chess/actions/workflows/ios.yml> →「Run workflow」→ 勾選「上傳到 App Store Connect」→ 執行。約 5–10 分鐘完成，再過 10–30 分鐘會出現在 App Store Connect 的「TestFlight」分頁。

之後每次改版都重複這一步，版號會自動遞增。

### 6. 先在自己手機上試玩（建議）

App Store Connect →「TestFlight」→「內部測試」→ 把自己加進去。iPhone 安裝 Apple 的「TestFlight」App，就能裝到測試版。

### 7. 填寫商店資訊並送審

App Store Connect → 你的 App →「1.0 準備提交」，下方「商店文字」可直接複製：

- **截圖**：上傳 `app/store/screenshots/` 的 7 張到「iPhone 6.9 吋顯示器」
- **建置版本**：選步驟 5 上傳的版本
- **App 隱私**：選「不蒐集資料」（理由見 `privacy.html`）
- **隱私權政策網址**：`https://thortsui.github.io/chess/privacy.html`
- **支援網址**：`https://github.com/thortsui/chess/issues`
- **類別**：主要「遊戲」，次要「桌上遊戲」與「策略」
- **年齡分級問卷**：「卡通或奇幻暴力」選「不常見／輕微」（動畫模式有棋子撞飛的畫面），其他都選「無」
- **價格**：免費
- **審核備註**：貼上下方「給審核人員的說明」

按「提交以供審核」。審核通常 1–3 天，通過後可以選擇自動或手動上架。

## 商店文字

**名稱**（30 字內）：對坐象棋

**副標題**（30 字內）：象棋・暗棋・西洋棋・五子棋・圍棋

**宣傳文字**（170 字內，可隨時改）：
拍桌子、貓耳棋子、炮台轟馬、騎馬撞兵——把對弈變得熱鬧好玩。單機、AI、連線都能下，離線也能玩。

**描述**：
```
對坐象棋把五種棋放進一個 App：象棋、暗棋、西洋棋、五子棋、九路圍棋。

【三種玩法】
・單機對戰：一台手機平放桌上，兩人面對面輪流下，黑方畫面自動倒轉
・AI 對戰：10 段強度，從新手到高手都有對手，完全離線運算
・線上對戰：建立房間，把 4 位數房號給朋友就能連線對弈，免註冊

【好玩的地方】
・拍桌子：不爽就拍桌！奶牛貓、橘貓、三花貓、柴犬、哈士奇或人手，從畫面右側一掌拍下
・個性棋子：替棋子戴上貓耳等配件，或換成立體武將人偶
・動畫模式：吃子時播放漫畫分鏡動畫，炮台轟擊、騎馬衝撞、騎象撞飛
・3D 模式：立體棋盤與棋子，移動有滑行軌跡

【講究的外觀】
・19 種字體，含小篆、隸書、楷書、明體、黑體
・紅黑雙方的字體、顏色、材質分開設定，自動避開難以辨認的配色
・整盤預覽，調整時立刻看到效果

【規則完整】
・象棋：完整規則，含禁止長將
・西洋棋：入堡、吃過路兵、升變
・圍棋：中國數子法、貼 6.5 目、禁止全局同形

不需要帳號、沒有廣告、不蒐集任何資料。
```

**關鍵字**（100 字元內，半形逗號分隔）：
```
象棋,中國象棋,暗棋,西洋棋,五子棋,圍棋,棋盤,雙人,對戰,AI,離線,翻棋,下棋,將棋
```

## 給審核人員的說明（App Review Notes）

```
對坐象棋 is a board-game app with five games (Chinese chess/xiangqi, banqi, chess, gomoku and 9x9 Go). No account or login is required.

How to test:
- Single device: tap 單機對戰 (Local) to play both sides on one iPhone.
- vs AI: choose a level and tap 開始對戰 (Start). The AI runs entirely on device.
- Online: tap 創建房間 (Create room) on one device and enter the 4-digit room code on another device. This is the only feature that needs a network connection.
- Settings (設定): 3D mode, animation mode (capture animations), table-slap hand, and piece styles.

All game logic, fonts and 3D models are bundled in the app and work fully offline. The app collects no personal data.
```

## 審核可能遇到的問題

- **4.2 最低功能要求**：Apple 會退回「只是把網站包起來」的 App。本 App 的所有內容都打包在裡面、斷網可完整遊玩，並使用 iPhone 觸覺回饋，屬於完整的遊戲；如果仍被退，可以在回覆中強調離線遊玩與 AI 對手，或再加入 Game Center 排行榜等原生功能。
- **名稱重複**：若「對坐象棋」已被使用，換一個名稱即可，Bundle ID 不用改。
- **字型與模型授權**：全部為 OFL、MIT、CC0 等允許商業使用的授權，清單見 `docs/功能說明.md` 第 13 節。

## 之後怎麼更新 App

1. 照平常方式修改網站並推上 git（GitHub 的雲端 Mac 會自動檢查能不能編譯）
2. 要發新版時，把 `app/ios/App/App.xcodeproj/project.pbxproj` 裡兩處 `MARKETING_VERSION = 1.0;` 改成新版號（例如 1.1）
3. 執行步驟 5 上傳，再到 App Store Connect 建立新版本、選這個建置版本、送審
