# 對坐象棋 — 給 Claude 的專案說明

- 跟 Ethan 用繁體中文溝通。每次修改完都要推上 git（他會說「上git」，沒說也要推）。
- 功能與實作細節都記在 `docs/功能說明.md`，改功能時同步更新。
- 每次推上 git 都在 `docs/工作日誌.md` 最後面補一筆（日期、時間、版本、做了什麼），和程式一起提交。

## 版本號規則
- 目前版本顯示在選單畫面右上角（`<span class="ver">`）。
- 修正、調整既有功能 → 第三碼 +1（0.5.0 → 0.5.1）。
- 加入新功能 → 第二碼 +1、第三碼歸零（0.5.3 → 0.6.0）。
- 每次推上 git 前執行 `python3 tools/bump_version.py fix` 或 `python3 tools/bump_version.py feature`，會同時改網站、iOS App（`MARKETING_VERSION`）、`app/package.json` 與 `docs/功能說明.md`。
