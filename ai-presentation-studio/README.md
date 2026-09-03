# AI Presentation Studio｜AI 簡報工作室

一個 **Local-first / Offline-first** 的 AI-Native HTML 簡報編輯器。

這不是 PowerPoint Clone，也不是 AI PPT Generator，而是一個
**Declarative AI Presentation Editor**：

```
Presentation = Specification
AI Component = Declarative AI Task
External AI  = Compiler / Agent
HTML         = Compiled Output
```

第一版**完全不串接任何 AI API**。你在簡報的任意位置放上「AI 元件」宣告要生成什麼，
編輯器產生一份 **AI Handoff Package**，交給外部 AI（Claude / ChatGPT / Gemini / Grok /
公司內部 SPADE）完成，再把結果匯回編輯器。

## 核心流程

```
編輯器 → Presentation Specification → AI Handoff Package
      → 外部 AI / SPADE → Completed Presentation
      → 匯入 → HTML Renderer → final-presentation.html
```

## 開發模式

需求：Node.js 20 以上（開發環境使用 Node 22）。

```bash
cd ai-presentation-studio
npm install
npm run dev        # 開發模式，預設 http://localhost:5173
```

開發模式使用 Vite 開發伺服器。修改程式後，瀏覽器會自動更新，並保留完整錯誤訊息。開發模式不會載入單檔套件，也不會執行單檔整理工具。

## 交付模式（免佈署單檔）

```bash
npm run build
```

完成後只會產生：

```text
dist/AI-Presentation-Studio.html
```

正式建置才會載入單檔套件。建置完成後，整理工具會檢查 JavaScript、CSS、圖示與外部資源，再清除其他建置檔案。

把這個檔案複製到任何資料夾，再直接雙擊即可使用。CSS、JavaScript 與圖示都已放進同一個 HTML 檔，不需要安裝程式、不需要啟動伺服器，也不需要網路。

其他指令：

```bash
npm run build      # 型別檢查 + 產生免佈署單檔 HTML
npm run preview    # 以靜態方式預覽 dist/（http://localhost:4173）
npm test           # 執行 400 項單元／整合測試
npm run typecheck  # 只做型別檢查
```

建置後的 `dist/AI-Presentation-Studio.html` 可直接雙擊開啟；
不需要伺服器、後端、資料庫、登入或任何雲端服務。所有資料都存在瀏覽器的 localStorage。

## 專案結構

```
src/
├── model/            Presentation Specification（唯一 Source of Truth）
│   ├── types.ts        型別定義：Presentation / Slide / Element / AITask / Patch
│   ├── factory.ts      建立元素與投影片、AI 任務同步
│   ├── demo.ts         示範簡報「2026 AI 科技趨勢」
│   ├── validator.ts    驗證器 → validation-report.json
│   ├── patch.ts        AI 回填：applyPatch / mergeCompletedPresentation
│   └── sanitize.ts     匯入內容的安全處理（XSS）
│
├── renderer/         Spec → HTML（不依賴 React，可獨立執行）
│   ├── renderElement.ts
│   └── renderHtml.ts   產生 self-contained 的 final-presentation.html
│
├── handoff/          AI Handoff
│   ├── instructions.ts AI-INSTRUCTIONS.md / README.md 產生器
│   ├── package.ts      Package 檔案組裝與 ZIP 打包
│   └── mockAi.ts       模擬 AI 完成（Demo 用，非真實 AI）
│
├── store/            編輯器狀態、Undo/Redo、localStorage
├── components/       UI（畫布、投影片列表、屬性面板、AI 任務面板、預覽、對話框）
├── actions/          選單動作（匯入／匯出／驗證／模擬）
└── lib/              檔案下載與讀取、中文標籤
```

架構上刻意分離：

```
Presentation Model
  ├── Editor      （React）
  ├── Validator   （純函式）
  └── Renderer    （純函式，不依賴 UI）
```

因此「外部 AI 產出的 Completed JSON → HTML」這條路徑完全不需要編輯器介入。

## 母片設計

按上方「母片設計」會開啟內容母片。左側可直接選擇「封面母片」或「內容母片」。

- 第一張投影片預設使用封面母片，其餘投影片預設使用內容母片
- 每張投影片可在右側「使用母片」切換封面母片或內容母片
- 兩張母片都支援文字、圖片、圖形、線條、表格與圖表
- 母片元素會顯示在對應的投影片、縮圖、預覽與匯出的 HTML
- 母片背景可以套用到使用該母片的投影片
- 每張投影片也可以關閉「使用母片背景」，保留自己的背景色
- 母片不能放 AI 元件

## AI 生成

上方「全 AI 生成」會先開設定視窗，再分兩步產生大綱與完整簡報。
大綱可修改、拖曳、新增、刪除、鎖定與單頁重新生成。
完成後可建立新簡報、加到後面或取代目前簡報。

左側「AI 生成單頁」屬於手動編輯模式。輸入主題與重點後，先看預覽，再決定是否加入。
單頁會插入目前頁後面。多選時會插入最後一張選取頁後面。

目前使用 `MockAIProvider`（離線的假 AI）。輸出會依主題、重點、頁面類型、視覺風格與前一頁改變。
程式沒有 API 金鑰，也不會將金鑰放入單檔 HTML。

AI 生成優先使用文字、圖形、線條、內建表格、內建圖表與群組。
生成後會檢查整頁圖片、整頁 SVG、含文字 SVG、唯一 ID、畫布邊界與文字重疊。

## 資料協定

| 協定 | 用途 |
| --- | --- |
| `ai-presentation/v1` | 簡報規格（presentation.json / completed-presentation.json） |
| `ai-presentation-patch/v1` | 差異回填（add_element / update_element / delete_element / replace_ai_output） |

所有 Presentation、Slide、Element、AI Task 都有穩定唯一 ID，**不使用陣列索引**。

## AI Handoff Package

「AI → 匯出 AI Package」會產生 `presentation-ai.zip`：

```
presentation-ai/
├── AI-INSTRUCTIONS.md      給 AI 的任務說明（任務清單、限制、輸出規範、驗證清單）
├── presentation.json       簡報規格
├── patch-template.json     只回傳差異時的填空範本
├── validation-report.json  匯出當下的驗證結果
├── README.md
├── assets/
│   ├── images/             內嵌圖片會被抽出成獨立檔案 + manifest.json
│   └── fonts/
└── output/                 請把 completed-presentation.json 放這裡
```

Package 只是一組普通檔案，SPADE 或任何 AI 工具拿到後可直接讀取，
不需要開發伺服器、API 或網路連線。

## 安全性

- 匯入的 JSON 一律 `JSON.parse` + 結構驗證，**絕不執行**其中的任何程式碼。
- 外部 AI 產生的 SVG / HTML 會通過白名單清理：移除 `<script>`、`on*` 事件屬性、
  `javascript:` 連結、`<iframe>` / `<object>` / `<foreignObject>` 等。
- 匯入結果只會寫入 AI 元件；非 AI 元件與鎖定元素一律不動。

## 已知限制

- 匯出檔名只保留 ASCII 字元（部分瀏覽器會忽略含中文的 `download` 屬性，
  把檔案存成 `download`）。中文標題完整保存在檔案內的 `metadata.title`。
- 只針對 Desktop 最佳化（1280×720 以上），未做手機版。
- 沒有雲端同步、多人協作、帳號系統——這是刻意的設計範圍。
