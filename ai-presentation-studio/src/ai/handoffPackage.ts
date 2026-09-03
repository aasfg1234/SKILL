import JSZip from 'jszip';
import { newId } from '../model/ids';
import type { Presentation, Slide } from '../model/types';
import type { FullAiForm, PresentationOutline, SingleSlideForm, SingleSlideContext } from './types';

export const FULL_OUTLINE_PROTOCOL = 'ai-presentation-full-outline/v1' as const;
export const FULL_PRESENTATION_PROTOCOL = 'ai-presentation-full-generation/v1' as const;
export const SINGLE_SLIDE_PROTOCOL = 'ai-presentation-single-slide/v1' as const;

export interface HandoffPackage {
  requestId: string;
  filename: string;
  blob: Blob;
}

export interface FullOutlineResult {
  protocol: typeof FULL_OUTLINE_PROTOCOL;
  requestId: string;
  sourcePresentationId: string;
  outline: PresentationOutline;
}

export interface FullPresentationResult {
  protocol: typeof FULL_PRESENTATION_PROTOCOL;
  requestId: string;
  sourcePresentationId: string;
  presentation: Presentation;
}

export interface SingleSlideResult {
  protocol: typeof SINGLE_SLIDE_PROTOCOL;
  requestId: string;
  sourcePresentationId: string;
  insertAfterSlideId: string;
  slide: Slide;
}

const EDITABLE_RULES = `
## 可編輯元件強制規則

- 標題、內文、數字與講者備註必須是可直接修改的文字。
- 表格必須使用 table 元件。圖表必須使用 chart 元件。
- 流程圖用圖形、文字與連接線組成。時間軸用線條、節點與文字組成。
- 比較圖與資訊卡必須拆成圖形與文字。
- 不得輸出整頁圖片、整頁 SVG 或整頁 HTML。
- SVG 只能用於單一裝飾，且不得含文字、表格、數據或圖表標籤。
- 每個投影片、元件與群組都要有唯一 ID。
- 所有元件必須在畫布內，不得重疊或遮住頁碼。
- 群組成員要共用 groupId，且群組必須可取消。
`;

function commonInstructions(source: Presentation, requestId: string): string {
  return `
- 請先讀取 request.json 與 presentation.json。
- 輸出內容必須使用繁體中文。
- 不得更改 requestId：${requestId}。
- 不得更改 sourcePresentationId：${source.metadata.id}。
- 只輸出 JSON，不要在 JSON 前後加 Markdown 符號。
${EDITABLE_RULES}`;
}

async function zipPackage(rootName: string, files: Record<string, string>, filename: string, requestId: string): Promise<HandoffPackage> {
  const zip = new JSZip();
  const root = zip.folder(rootName);
  if (!root) throw new Error('無法建立 AI 壓縮檔。');
  Object.entries(files).forEach(([path, content]) => root.file(path, content));
  return { requestId, filename, blob: await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }) };
}

export async function buildFullOutlinePackage(form: FullAiForm, source: Presentation): Promise<HandoffPackage> {
  const requestId = newId('full-outline-request');
  const request = { protocol: FULL_OUTLINE_PROTOCOL, requestId, sourcePresentationId: source.metadata.id, form };
  const instructions = `# 全 AI 生成：大綱階段

請根據設定產生簡報大綱，不要產生完整投影片。
${commonInstructions(source, requestId)}

輸出檔名：output/full-ai-outline-result.json。
輸出格式必須是：

JSON 格式如下：

{
  "protocol": "${FULL_OUTLINE_PROTOCOL}",
  "requestId": "${requestId}",
  "sourcePresentationId": "${source.metadata.id}",
  "outline": {
    "title": "簡報標題",
    "subtitle": "簡報副標題",
    "slides": [{ "id": "outline-unique-id", "title": "頁標題", "summary": "內容摘要", "layoutId": "title-content", "visualSuggestion": "建議視覺", "notesSummary": "講者備註摘要", "locked": false }]
  }
}

layoutId 只能是 title、title-content、two-column 或 image-text。
投影片數量必須等於設定的 ${form.slideCount} 張。
`;
  return zipPackage('full-ai-outline', {
    'AI-INSTRUCTIONS.md': instructions,
    'request.json': `${JSON.stringify(request, null, 2)}\n`,
    'presentation.json': `${JSON.stringify(source, null, 2)}\n`,
    'output/README.md': '# 輸出\n\n請將`full-ai-outline-result.json`放在這裡，再交回使用者。\n',
  }, 'full-ai-outline-package.zip', requestId);
}

export async function buildFullPresentationPackage(form: FullAiForm, outline: PresentationOutline, source: Presentation): Promise<HandoffPackage> {
  const requestId = newId('full-presentation-request');
  const request = { protocol: FULL_PRESENTATION_PROTOCOL, requestId, sourcePresentationId: source.metadata.id, form, outline };
  const instructions = `# 全 AI 生成：完整簡報階段

請依 request.json 中經使用者確認的大綱，產生完整 Presentation。
${commonInstructions(source, requestId)}

第一張使用封面母片，其餘使用內容母片。
必須使用 presentation.json 相同的 Presentation 格式與元件型別。
圖片必須是 data URL。結果必須通過畫布邊界與 ID 檢查。

輸出檔名：output/full-ai-presentation-result.json。
輸出格式：

JSON 格式如下：

{
  "protocol": "${FULL_PRESENTATION_PROTOCOL}",
  "requestId": "${requestId}",
  "sourcePresentationId": "${source.metadata.id}",
  "presentation": { "protocol": "ai-presentation/v1", "version": "1.0.0", "metadata": {}, "settings": {}, "theme": {}, "masters": {}, "slides": [], "aiTasks": [], "execution": { "mode": "external-handoff" } }
}
`;
  return zipPackage('full-ai-presentation', {
    'AI-INSTRUCTIONS.md': instructions,
    'request.json': `${JSON.stringify(request, null, 2)}\n`,
    'presentation.json': `${JSON.stringify(source, null, 2)}\n`,
    'output/README.md': '# 輸出\n\n請將`full-ai-presentation-result.json`放在這裡，再交回使用者。\n',
  }, 'full-ai-presentation-package.zip', requestId);
}

export async function buildSingleSlidePackage(form: SingleSlideForm, context: SingleSlideContext, source: Presentation): Promise<HandoffPackage> {
  const requestId = newId('single-slide-request');
  const request = { protocol: SINGLE_SLIDE_PROTOCOL, requestId, sourcePresentationId: source.metadata.id, form, context };
  const instructions = `# AI 生成單頁

請根據使用者設定、前後頁摘要、主題色、字型與內容母片產生一張投影片。
不要重複前一頁已說過的內容。
${commonInstructions(source, requestId)}

只產生一個符合目前 Slide 格式的投影片。
投影片必須使用內容母片，並保持 ${context.width} × ${context.height} 畫布邊界。
圖片沒有合法來源時，請用可編輯的矩形與文字建立圖片預留框。

輸出檔名：output/single-slide-result.json。
輸出格式：

JSON 格式如下：

{
  "protocol": "${SINGLE_SLIDE_PROTOCOL}",
  "requestId": "${requestId}",
  "sourcePresentationId": "${source.metadata.id}",
  "insertAfterSlideId": "${context.insertAfterSlideId}",
  "slide": { "id": "slide-unique-id", "title": "本頁標題", "masterKind": "content", "useMasterBackground": true, "background": "#FFFFFF", "notes": "", "elements": [] }
}
`;
  return zipPackage('single-slide-ai', {
    'AI-INSTRUCTIONS.md': instructions,
    'request.json': `${JSON.stringify(request, null, 2)}\n`,
    'presentation.json': `${JSON.stringify(source, null, 2)}\n`,
    'output/README.md': '# 輸出\n\n請將`single-slide-result.json`放在這裡，再交回使用者。\n',
  }, 'single-slide-ai-package.zip', requestId);
}

export function parseHandoffJson<T extends { protocol: string; requestId: string }>(text: string, protocol: string, requestId: string): T {
  let data: unknown;
  try { data = JSON.parse(text); } catch (error) { throw new Error(`JSON 格式錯誤：${(error as Error).message}。請請 AI 重新輸出純 JSON。`); }
  if (!data || typeof data !== 'object') throw new Error('AI 結果不是 JSON 物件。請請 AI 重新產生。');
  const result = data as T;
  if (result.protocol !== protocol) throw new Error(`AI 結果協定不正確。預期 ${protocol}。`);
  if (result.requestId !== requestId) throw new Error('AI 結果不屬於這次任務。請選擇剛才該壓縮檔產生的結果。');
  return result;
}
