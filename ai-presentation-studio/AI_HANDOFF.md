# AI Handoff

兩個 AI 輪流開發這個專案。這個檔案只保存「目前最新的接力狀態」。

- 規則本體在 `AI_PROTOCOL.md`。**第一次接手請先讀它。**
- 完整歷史紀錄在 `AI_HISTORY/`。

---

## 最新 Session

- AI：Claude
- Session：003
- 日期：2026-09-02
- 狀態：完成

最新 Session 檔案：`AI_HISTORY/2026-09-02_003_Claude.md`

---

## 目前專案狀態

AI Presentation Studio 單機版 MVP 可用，核心流程全通。

- 82 項測試全過，型別檢查無錯誤，正式建置成功
- `npm run build` 產出可離線雙擊的 `dist/AI-Presentation-Studio.html`
- 已實作：畫布編輯、投影片列表與拖曳排序、屬性面板、AI 任務面板、播放模式、群組、對齊、均分、吸附、復原／重作
- 「模擬 AI 完成」可一次回填全部 AI 元件，回填位置正確
- 完全不串接任何 AI API，這是第一版刻意的設計

Session 002 做了一次深度手動測試，找出 3 個 Bug 與 10 項體驗問題。
Session 003 把 3 個 Bug 全部修完並驗證。

### ✅ 已修復（Session 003）

| 編號 | 問題 | 修法 |
| --- | --- | --- |
| BUG-1 | 新增元素永遠疊在最底層 | `factory.ts` 預設 z 由 1 改成 0，讓 `element.z \|\| nextZ(...)` 生效 |
| BUG-2 | 畫布浮層蓋過對話框 | 新增 `src/lib/layers.ts` 統一管理 z-index |
| BUG-3 | 文字溢出行為不一致 | `Canvas.tsx` 新增 `growTextHeight`，編輯時自動長高 |

### 仍待處理

- Session 002 第 7 節的 10 項體驗問題（UX-1 ～ UX-10）全部未動
- Session 002 第 7 節的建議功能全部未實作

---

## 下一步

先問使用者。若無指示，建議順序：

1. **UX-3 重疊警告門檻太寬**。任兩個框相交就報紅字，示範簡報一開啟就在警告，是誤報機器
2. **UX-1 右鍵選單**。目前右鍵完全沒反應
3. **投影片版型範本**。Session 002 評為價值最高的新功能

另外仍待處理：worktree 分支 `claude/ai-relay-development-protocol-9d1ab7` 停在舊版 `64ff752`，尚未同步。

---

## 重要注意事項

1. **專案有兩份副本。** 動手前先跑 `git worktree list` 與 `git status`，確認自己站在哪一份、哪一個分支。弄錯會讓工作消失在另一份副本裡。所有開發請在本體 `ai-presentation-studio/` 進行。
2. **不要把 `factory.ts` 的 z 預設值改回 1，也不要把 `element.z || nextZ(...)` 改成 `??`。** 兩者都會讓 BUG-1 復發。`0` 代表「尚未指定層次」。
3. **所有 z-index 一律從 `src/lib/layers.ts` 取。** 不要在元件裡寫死數字，也不要用 `z-[...]` 類別。`layers.test.ts` 會擋住順序被破壞。
4. **不要動 `demo.ts` 既有的 z 值。** 示範簡報的層次是刻意排的。
5. **不要直接刪掉「重疊警告」。** 它有用，只是判斷門檻太寬，要改的是門檻不是功能。
6. **改動 UI 行為時，單元測試之外一定要真的開瀏覽器操作一次。** Session 003 遇過函式測試全過、但根本沒接上的情況。
7. **不要串接真的 AI API。** 第一版刻意不串。要改必須先問使用者。
8. **不要動 `src/model/sanitize.ts` 的白名單清理。** 那是唯一的 XSS 防線。
9. **完整的「已確定設計決策」清單在 `AI_PROTOCOL.md` 第十二節。** 推翻任何一項之前，先讀它。

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
