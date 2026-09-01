# AI Handoff

兩個 AI 輪流開發這個專案。這個檔案只保存「目前最新的接力狀態」。

- 規則本體在 `AI_PROTOCOL.md`。**第一次接手請先讀它。**
- 完整歷史紀錄在 `AI_HISTORY/`。

---

## 最新 Session

- AI：Claude
- Session：001
- 日期：2026-09-02
- 狀態：完成

最新 Session 檔案：`AI_HISTORY/2026-09-02_001_Claude.md`

---

## 目前專案狀態

AI Presentation Studio 單機版 MVP 可用。

- 69 項測試全過，型別檢查無錯誤
- `npm run build` 產出可離線雙擊的 `dist/AI-Presentation-Studio.html`
- 已實作：畫布編輯、投影片列表、屬性面板、AI 任務面板、預覽、群組、對齊、均分、拖曳吸附、復原／重作
- AI Handoff Package 匯出與 Completed JSON 匯回都已完成
- 完全不串接任何 AI API，這是第一版刻意的設計

Session 001 做了三件事：寫下 `AI_PROTOCOL.md`、建立接力紀錄系統、把工作目錄中 1336 行從未提交的改動原樣存檔（commit `397645c`）。

---

## 下一步

先問使用者要做什麼。Session 001 沒有拿到具體開發需求。

若無指示，優先處理：把 worktree 分支 `claude/ai-relay-development-protocol-9d1ab7` 同步到最新 commit。它目前停在舊版 `64ff752`。

---

## 重要注意事項

1. **專案有兩份副本。** 動手前先跑 `git worktree list` 與 `git status`，確認自己站在哪一份、哪一個分支。弄錯會讓工作消失在另一份副本裡。
2. **不要串接真的 AI API。** 第一版刻意不串。要改必須先問使用者。
3. **不要動 `src/model/sanitize.ts` 的白名單清理。** 那是唯一的 XSS 防線。
4. **不要把 `vite-plugin-singlefile` 移到開發模式。** 它只在正式建置載入，是刻意的。
5. **不要改用陣列索引定位元素。** 全專案都靠穩定唯一 ID。
6. **完整的「已確定設計決策」清單在 `AI_HISTORY/2026-09-02_001_Claude.md` 第 4 節。** 推翻任何一項之前，先讀它。

---

## 接力規則摘要

完整規則在 `AI_PROTOCOL.md`。以下只是提醒。

開始工作前：

0. 讀 `AI_PROTOCOL.md`
1. 讀這個檔案，確認最新 Session 是誰做的
2. 若最新 Session 是另一個 AI：從自己上一個 Session 讀到最新 Session
3. 若最新 Session 是自己：直接從自己最新 Session 繼續
4. 不要一次讀完整個 `AI_HISTORY/`，會浪費 token
5. 紀錄與實際程式碼不一致時，以實際程式碼為準，並在新紀錄中指出

工作結束前：

1. 在 `AI_HISTORY/` 建立 `日期_流水號_AI名稱.md`，流水號遞增
2. 更新這個檔案
