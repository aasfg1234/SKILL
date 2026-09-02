# AI Handoff

兩個 AI 輪流開發這個專案。這個檔案只保存「目前最新的接力狀態」。

- 規則本體在 `AI_PROTOCOL.md`。**第一次接手請先讀它。**
- 完整歷史紀錄在 `AI_HISTORY/`。

---

## 最新 Session

- AI：Claude
- Session：002
- 日期：2026-09-02
- 狀態：完成（只做診斷，未改程式碼）

最新 Session 檔案：`AI_HISTORY/2026-09-02_002_Claude.md`

---

## 目前專案狀態

AI Presentation Studio 單機版 MVP 可用，核心流程全通。

- 69 項測試全過，型別檢查無錯誤
- `npm run build` 產出可離線雙擊的 `dist/AI-Presentation-Studio.html`
- 已實作：畫布編輯、投影片列表與拖曳排序、屬性面板、AI 任務面板、播放模式、群組、對齊、均分、吸附、復原／重作
- 「模擬 AI 完成」可一次回填全部 AI 元件，回填位置正確
- 完全不串接任何 AI API，這是第一版刻意的設計

Session 002 做了一次深度手動測試，**沒有改任何程式碼**，找出 3 個 Bug 與 10 項體驗問題。

### ⚠️ 待修 Bug（依嚴重度）

| 編號 | 問題 | 位置 |
| --- | --- | --- |
| BUG-1 | 新增的元素 z 一律是 1，永遠疊在最底層。畫圖形看起來像沒反應 | `model/factory.ts:98,228`、`store/editorStore.ts:546` |
| BUG-2 | 畫布浮層 z-index 10000／10001，蓋過只有 z-120 的對話框 | `Canvas.tsx`、`Dialogs.tsx` |
| BUG-3 | 文字溢出：編輯中被裁掉，編輯後又跑出框外，兩種行為不一致 | `Canvas.tsx:1275`、`ElementView.tsx:148` |

完整重現步驟、證據與修法注意事項在 `AI_HISTORY/2026-09-02_002_Claude.md` 第 5 節。

---

## 下一步

先問使用者要修 Bug 還是加功能。

若要修 Bug，建議順序：BUG-1 → BUG-2 → BUG-3。一次一項，每項都要先補一個會失敗的測試再修。

若要加功能，Session 002 第 7 節有依價值排序的清單。前三名是：投影片版型範本、圖片拖放與貼上、文字框自動長高。

另外仍待處理：worktree 分支 `claude/ai-relay-development-protocol-9d1ab7` 停在舊版 `64ff752`，尚未同步。

---

## 重要注意事項

1. **專案有兩份副本。** 動手前先跑 `git worktree list` 與 `git status`，確認自己站在哪一份、哪一個分支。弄錯會讓工作消失在另一份副本裡。所有開發請在本體 `ai-presentation-studio/` 進行。
2. **修 BUG-1 不能只把 `||` 換成 `??`。** `init.z ?? 1` 也要一起處理，否則仍會拿到 1。細節見 Session 002。
3. **不要動 `demo.ts` 既有的 z 值。** 示範簡報的層次是刻意排的。
4. **不要直接刪掉「重疊警告」。** 它有用，只是判斷門檻太寬，要改的是門檻不是功能。
5. **不要串接真的 AI API。** 第一版刻意不串。要改必須先問使用者。
6. **不要動 `src/model/sanitize.ts` 的白名單清理。** 那是唯一的 XSS 防線。
7. **完整的「已確定設計決策」清單在 `AI_PROTOCOL.md` 第十二節。** 推翻任何一項之前，先讀它。

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
