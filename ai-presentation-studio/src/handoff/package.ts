import JSZip from 'jszip';
import { createPatchTemplate } from '../model/patch';
import { validatePresentation } from '../model/validator';
import type { Presentation } from '../model/types';
import { buildAiInstructions, buildReadme } from './instructions';

/**
 * AI Handoff Package 組裝。
 *
 * Package 只是一組普通檔案：任何 AI 工具或 SPADE 拿到後直接讀取即可，
 * 不需要開發伺服器、不需要 API、不需要網路。
 */

export const PACKAGE_ROOT = 'presentation-ai';

export interface BinaryEntry {
  /** 不含 data: 前綴的 base64 內容 */
  base64: string;
  mime: string;
}

export interface PackageFiles {
  text: Record<string, string>;
  binary: Record<string, BinaryEntry>;
}

const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

interface ExtractedImage {
  elementId: string;
  slideId: string;
  file: string;
  mime: string;
  bytes: number;
}

function extractImages(presentation: Presentation): {
  binary: Record<string, BinaryEntry>;
  manifest: ExtractedImage[];
} {
  const binary: Record<string, BinaryEntry> = {};
  const manifest: ExtractedImage[] = [];

  for (const slide of presentation.slides) {
    for (const el of slide.elements) {
      const src =
        el.type === 'image'
          ? el.src
          : el.type === 'ai_component' && el.result?.type === 'image'
            ? el.result.content
            : '';
      const m = /^data:([^;,]+);base64,(.+)$/i.exec(String(src ?? ''));
      if (!m) continue;
      const mime = m[1].toLowerCase();
      const ext = MIME_EXT[mime] ?? 'bin';
      const file = `assets/images/${el.id}.${ext}`;
      binary[file] = { base64: m[2], mime };
      manifest.push({
        elementId: el.id,
        slideId: slide.id,
        file,
        mime,
        bytes: Math.floor((m[2].length * 3) / 4),
      });
    }
  }

  return { binary, manifest };
}

/**
 * 產生 Package 中的所有檔案內容。
 * 與 ZIP 打包分離，方便測試與未來輸出成資料夾。
 */
export function buildPackageFiles(presentation: Presentation): PackageFiles {
  const report = validatePresentation(presentation);
  const { binary, manifest } = extractImages(presentation);

  const text: Record<string, string> = {
    'AI-INSTRUCTIONS.md': buildAiInstructions(presentation),
    'README.md': buildReadme(presentation),
    'presentation.json': `${JSON.stringify(presentation, null, 2)}\n`,
    'patch-template.json': `${JSON.stringify(createPatchTemplate(presentation), null, 2)}\n`,
    'validation-report.json': `${JSON.stringify(report, null, 2)}\n`,
    'assets/images/manifest.json': `${JSON.stringify(
      { count: manifest.length, images: manifest },
      null,
      2,
    )}\n`,
    'assets/fonts/README.md':
      '# 字型\n\n本版本未內嵌字型檔。請在 SVG 中使用 `sans-serif` 等泛用字族，\n避免產出的簡報依賴特定字型。\n',
    'output/README.md': `# output

請把完成的檔案放在這個資料夾：

- \`completed-presentation.json\`（必要）：完整的 Presentation Specification，
  其中 AI 任務的 \`status\` 為 \`completed\` 且帶有 \`result\`。
- \`final-presentation.html\`（選用）：可直接以瀏覽器開啟的簡報。
- \`validation-report.json\`（選用）：你自行執行的驗證結果。

使用者會把 \`completed-presentation.json\` 匯回 AI Presentation Studio。
`,
  };

  return { text, binary };
}

/** 打包為 presentation-ai.zip 的 Blob。 */
export async function buildAiPackageZip(presentation: Presentation): Promise<Blob> {
  const files = buildPackageFiles(presentation);
  const zip = new JSZip();
  const root = zip.folder(PACKAGE_ROOT);
  if (!root) throw new Error('無法建立 ZIP 資料夾');

  for (const [path, content] of Object.entries(files.text)) {
    root.file(path, content);
  }
  for (const [path, entry] of Object.entries(files.binary)) {
    root.file(path, entry.base64, { base64: true });
  }

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

/** 供「複製 AI 指令」使用的精簡提示詞。 */
export function buildAiPromptText(presentation: Presentation): string {
  const pending = presentation.aiTasks.filter(
    (t) => t.status === 'pending' || t.status === 'error',
  );
  const lines = pending.map((task) => {
    const hint = task.layoutHint;
    return `- ${task.id}（${task.type}／輸出 ${task.outputFormat}）→ slideId: ${task.target.slideId}, elementId: ${task.target.elementId}, 版面 ${hint?.width}×${hint?.height}
  Prompt：${task.prompt.replace(/\n/g, ' ')}`;
  });

  return `我有一份 AI-Native 簡報規格（protocol: ${presentation.protocol}）。
請依照下列任務產生內容，並回傳一份完整的 completed-presentation.json，
或回傳符合 ai-presentation-patch/v1 的 Patch。

簡報：${presentation.metadata.title}（${presentation.slides.length} 頁，${presentation.settings.width}×${presentation.settings.height}）

待處理的 AI 任務：
${lines.length ? lines.join('\n') : '（目前沒有待處理任務）'}

規則：
1. 只能修改 aiTasks 指定的 ai_component 元素，其餘元素一字不改。
2. 不得更動任何 slide.id 與 element.id，也不得改變投影片數量與尺寸。
3. 圖表／流程圖／時間軸／資訊圖表一律輸出帶 viewBox 的 SVG。
4. SVG 不得包含 <script>、on* 事件屬性、<foreignObject> 或外部資源。
5. 完成的任務設定 status 為 completed 並填入 result；無法完成的設定 status 為 error 並填寫 errorMessage。
6. 內容使用繁體中文。

我會另外提供 presentation.json 的完整內容。`;
}
