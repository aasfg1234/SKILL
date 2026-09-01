import type { Presentation } from '../model/types';
import { aiKindLabel } from '../renderer/renderElement';

/**
 * AI Handoff 文件產生器。
 *
 * 這些文字會被外部 AI（Claude / ChatGPT / Gemini / Grok / SPADE）直接讀取，
 * 因此措辭必須明確、可執行、不留想像空間。
 */

function taskTable(presentation: Presentation): string {
  if (presentation.aiTasks.length === 0) {
    return '（目前沒有任何 AI 任務）';
  }
  const rows = presentation.aiTasks.map((task) => {
    const slideIndex = presentation.slides.findIndex((s) => s.id === task.target.slideId) + 1;
    return `| ${task.id} | ${task.type} | ${slideIndex} | \`${task.target.slideId}\` | \`${task.target.elementId}\` | ${task.outputFormat} | ${task.status} |`;
  });
  return [
    '| Task ID | 類型 | 頁次 | slideId | elementId | 輸出格式 | 目前狀態 |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n');
}

function taskDetails(presentation: Presentation): string {
  return presentation.aiTasks
    .map((task) => {
      const hint = task.layoutHint;
      return `### ${task.id}｜${aiKindLabel(task.type)}

- 目標投影片：\`${task.target.slideId}\`（第 ${hint?.slideIndex ?? '?'} 頁）
- 目標元素：\`${task.target.elementId}\`
- 輸出格式：\`${task.outputFormat}\`
- 可用版面：x=${hint?.x} y=${hint?.y} 寬=${hint?.width} 高=${hint?.height}（投影片尺寸 ${hint?.slideWidth}×${hint?.slideHeight}）
- 位置限制：${task.constraints?.preservePosition ? '不得移動' : '可調整位置'}、${task.constraints?.preserveSize ? '不得改變尺寸' : '可調整尺寸'}

**Prompt**

> ${task.prompt.split('\n').join('\n> ') || '（未填寫）'}
`;
    })
    .join('\n');
}

export function buildAiInstructions(presentation: Presentation): string {
  const { width, height } = presentation.settings;
  const pending = presentation.aiTasks.filter((t) => t.status === 'pending').length;

  return `# AI Presentation Task

你正在處理一份 AI-Native Presentation。這份 Package 由 AI Presentation Studio 匯出，
其中的 \`presentation.json\` 是這份簡報的唯一 Source of Truth。

## 一、任務總覽

- 簡報標題：${presentation.metadata.title}
- 投影片數：${presentation.slides.length}
- 投影片尺寸：${width} × ${height}（${presentation.settings.aspectRatio}）
- AI 任務總數：${presentation.aiTasks.length}，其中待處理 ${pending} 項
- 協定版本：\`${presentation.protocol}\`（規格版本 ${presentation.version}）

## 二、你的工作流程

1. 讀取 \`presentation.json\`。
2. 找出 \`aiTasks\` 中所有 \`status\` 為 \`pending\` 或 \`error\` 的任務。
3. 依照每個任務的 \`prompt\`、\`type\`、\`outputFormat\` 產生內容。
4. 將結果寫回該任務 \`target.elementId\` 所指的元素，設定其 \`result\` 與 \`status: "completed"\`。
5. 不得修改任何非 AI 元件（\`type\` 不是 \`ai_component\` 的元素）。
6. 不得移動或修改 \`locked: true\` 的元素。
7. 不得更動 \`settings.width\`、\`settings.height\` 或任何 \`slide.id\`、\`element.id\`。
8. 保留原始內容：沒有被任務指定的欄位一律原樣輸出。
9. 完成所有可執行的任務；無法完成的任務請設定 \`status: "error"\` 並填寫 \`errorMessage\`，不要留白。
10. 執行第五節的驗證檢查。
11. 修正驗證發現的問題。
12. 輸出 \`output/completed-presentation.json\`。
13. （選用）輸出 \`output/final-presentation.html\`。

每個任務的 \`target\` 已經指定 \`slideId\` 與 \`elementId\`，
版面座標也已在 \`layoutHint\` 中提供。**不要自行猜測內容要放在哪一頁或哪個位置。**

## 三、輸出內容的要求

- 優先使用 **SVG**：圖表、流程圖、時間軸、資訊圖表一律輸出 SVG 字串。
- SVG 必須帶有 \`viewBox\`，並且能在指定的寬高框內完整顯示（建議 \`preserveAspectRatio="xMidYMid meet"\`）。
- SVG 內**不得**包含 \`<script>\`、\`on*\` 事件屬性、\`<foreignObject>\`、外部連結或遠端資源；
  匯入端會直接移除這些內容。
- 字型請使用 \`font-family="sans-serif"\` 一類的泛用字族，不要依賴特定字型檔。
- 文字類任務輸出純文字（\`outputFormat: "text"\`），不要包 Markdown 語法。
- 所有內容使用繁體中文，除非 Prompt 另有指定。

寫回的格式：

\`\`\`json
{
  "id": "ai-chart-001",
  "type": "ai_component",
  "status": "completed",
  "result": {
    "type": "svg",
    "content": "<svg viewBox=\\"0 0 1640 620\\" xmlns=\\"http://www.w3.org/2000/svg\\">...</svg>",
    "producer": "external-ai",
    "producedAt": "2026-01-01T00:00:00.000Z"
  }
}
\`\`\`

同時請一併更新 \`aiTasks\` 中對應任務的 \`status\` 與 \`result\`，兩處保持一致。

## 四、任務清單

${taskTable(presentation)}

${taskDetails(presentation)}

## 五、輸出前的驗證

輸出 \`completed-presentation.json\` 之前，請自行確認：

- [ ] JSON 可以被解析，且 \`protocol\` 仍為 \`${presentation.protocol}\`。
- [ ] 投影片數量與順序未改變（共 ${presentation.slides.length} 頁）。
- [ ] 所有 \`slide.id\` 與 \`element.id\` 與輸入完全相同，沒有新增或遺漏。
- [ ] 每個元素的 \`x\`、\`y\`、\`width\`、\`height\` 與輸入相同（除非該任務允許調整）。
- [ ] 沒有任何元素超出 ${width} × ${height} 的範圍。
- [ ] 每個 \`aiTasks\` 項目的 \`target.slideId\` / \`target.elementId\` 都仍然存在。
- [ ] 每個 \`status: "completed"\` 的任務都有非空的 \`result.content\`。
- [ ] 非 AI 元件的內容一字未改。

（選用）可另外輸出 \`output/validation-report.json\`，格式參考 Package 內附的 \`validation-report.json\`。

## 六、部分完成是被允許的

如果其中某些任務無法完成，請完成其餘任務，並將失敗的任務標記為：

\`\`\`json
{ "status": "error", "errorMessage": "無法完成的原因" }
\`\`\`

匯入端支援「部分完成」，不會因為單一任務失敗而丟棄整份簡報。

## 七、若你偏好輸出 Patch

除了完整的 \`completed-presentation.json\`，也可以只輸出差異：

\`\`\`json
{
  "protocol": "ai-presentation-patch/v1",
  "operations": [
    {
      "operation": "replace_ai_output",
      "taskId": "${presentation.aiTasks[0]?.id ?? 'TASK-001'}",
      "targetElementId": "${presentation.aiTasks[0]?.target.elementId ?? 'ai-chart-001'}",
      "output": { "type": "svg", "content": "<svg ...></svg>" }
    }
  ]
}
\`\`\`

Package 內的 \`patch-template.json\` 已經預先列出所有待處理任務，可直接填入 \`content\`。
`;
}

export function buildReadme(presentation: Presentation): string {
  return `# ${presentation.metadata.title}｜AI Handoff Package

這份 Package 由 **AI Presentation Studio** 匯出，用途是把簡報中「尚未完成的 AI 內容」
交給外部 AI（Claude、ChatGPT、Gemini、Grok，或公司內部 SPADE）完成，再匯回編輯器。

## 檔案結構

\`\`\`
presentation-ai/
├── AI-INSTRUCTIONS.md          給 AI 讀的任務說明（請先讀這份）
├── presentation.json           簡報規格，唯一 Source of Truth
├── patch-template.json         只想回傳差異時可直接填寫的範本
├── validation-report.json      匯出當下的驗證結果
├── README.md                   本檔
├── assets/
│   ├── images/                 簡報中內嵌圖片的獨立檔案與 manifest
│   └── fonts/                  字型（本版本不內嵌字型）
└── output/                     請把產出的檔案放在這裡
\`\`\`

## 給人類的使用方式

1. 把整包資料夾（或 ZIP）交給你選擇的 AI 工具。
2. 請它先讀 \`AI-INSTRUCTIONS.md\`，再讀 \`presentation.json\`。
3. 取回 \`output/completed-presentation.json\`。
4. 回到 AI Presentation Studio，選擇「AI → 匯入 AI 完成結果」。
5. AI 元件會從「等待 AI 處理」變成「AI 已完成」，生成內容會出現在原本指定的位置。

## 給 AI / SPADE 的使用方式

這是一組**普通檔案**，不需要任何開發伺服器、API 或網路連線即可讀取：

- 讀取 \`presentation.json\` 取得完整簡報規格。
- 讀取 \`AI-INSTRUCTIONS.md\` 取得任務定義與輸出規範。
- 產出寫入 \`output/completed-presentation.json\`（完整規格）或符合 \`ai-presentation-patch/v1\` 的 Patch。

## 目前的 AI 任務

| Task ID | 類型 | 目標投影片 | 目標元素 | 狀態 |
| --- | --- | --- | --- | --- |
${presentation.aiTasks
  .map(
    (t) =>
      `| ${t.id} | ${aiKindLabel(t.type)} | \`${t.target.slideId}\` | \`${t.target.elementId}\` | ${t.status} |`,
  )
  .join('\n')}

## 重要原則

- 位置、大小、頁次都已由規格定義，AI 不需要（也不應該）自行決定版面。
- 非 AI 元件不可被修改；匯入端會忽略任何對非 AI 元件的更動。
- 匯出時間：${new Date().toISOString()}
`;
}
