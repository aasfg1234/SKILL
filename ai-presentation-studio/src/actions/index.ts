import { PATCH_PROTOCOL, PRESENTATION_PROTOCOL, type Presentation, type PresentationPatch } from '../model/types';
import { createPresentation, createSlide } from '../model/factory';
import { parsePresentationJson, validatePresentation } from '../model/validator';
import { renderPresentationToHtml } from '../renderer/renderHtml';
import { buildAiPackageZip, buildAiPromptText } from '../handoff/package';
import { buildMockPatch } from '../handoff/mockAi';
import { copyToClipboard, downloadBlob, downloadText, pickTextFile, slugify } from '../lib/files';
import { editorStore } from '../store/editorStore';

/**
 * 選單動作層。
 * 把「使用者操作」與「資料模型」接起來，UI 元件只負責呼叫這裡的函式。
 */

function currentPresentation(): Presentation {
  return editorStore.getState().presentation;
}

function baseName(): string {
  return slugify(currentPresentation().metadata.title);
}

/* ------------------------------------------------------------------ */
/* 儲存 / 匯出                                                          */
/* ------------------------------------------------------------------ */

export function saveNow(): void {
  if (editorStore.save()) {
    editorStore.toast({ tone: 'success', title: '已儲存至瀏覽器本機儲存空間' });
  }
}

export function exportJson(): void {
  const presentation = currentPresentation();
  downloadText(
    `${JSON.stringify(presentation, null, 2)}\n`,
    `${baseName()}.ai-presentation.json`,
  );
  editorStore.toast({
    tone: 'success',
    title: '已匯出 JSON',
    detail: '此檔案就是完整的 Presentation Specification。',
  });
}

export function exportHtml(): void {
  const presentation = currentPresentation();
  const html = renderPresentationToHtml(presentation);
  downloadText(html, `${baseName()}.html`, 'text/html');
  editorStore.toast({
    tone: 'success',
    title: '已匯出 HTML',
    detail: '檔案為單一自足檔案，可直接以瀏覽器開啟播放。',
  });
}

export async function exportAiPackage(): Promise<void> {
  const presentation = currentPresentation();
  if (presentation.aiTasks.length === 0) {
    editorStore.toast({
      tone: 'warning',
      title: '這份簡報沒有任何 AI 任務',
      detail: '請先在畫布上建立 AI 元件，並填寫 Prompt。',
    });
    return;
  }
  const missingPrompt = presentation.aiTasks.filter((t) => !t.prompt.trim());
  try {
    const blob = await buildAiPackageZip(presentation);
    downloadBlob(blob, 'presentation-ai.zip');
    editorStore.toast({
      tone: missingPrompt.length ? 'warning' : 'success',
      title: '已匯出 AI Package（presentation-ai.zip）',
      detail: missingPrompt.length
        ? `其中 ${missingPrompt.length} 個任務尚未填寫 Prompt，外部 AI 可能無法判斷要生成什麼。`
        : '可直接交給 Claude／ChatGPT／Gemini／Grok／SPADE 處理。',
    });
  } catch (err) {
    editorStore.toast({
      tone: 'error',
      title: '匯出 AI Package 失敗',
      detail: (err as Error).message,
    });
  }
}

export async function copyAiInstruction(): Promise<void> {
  const text = buildAiPromptText(currentPresentation());
  const ok = await copyToClipboard(text);
  if (ok) {
    editorStore.toast({
      tone: 'success',
      title: '已複製 AI 指令',
      detail: '貼到任何 AI 對話視窗，再附上 presentation.json 即可。',
    });
  } else {
    editorStore.openDialog({ kind: 'ai-prompt', text });
  }
}

export function showAiInstruction(): void {
  editorStore.openDialog({ kind: 'ai-prompt', text: buildAiPromptText(currentPresentation()) });
}

/* ------------------------------------------------------------------ */
/* 驗證                                                                 */
/* ------------------------------------------------------------------ */

export function runValidation(): void {
  const report = validatePresentation(currentPresentation());
  editorStore.openDialog({ kind: 'validation', report });
}

export function exportValidationReport(): void {
  const report = validatePresentation(currentPresentation());
  downloadText(`${JSON.stringify(report, null, 2)}\n`, 'validation-report.json');
  editorStore.toast({ tone: 'success', title: '已匯出 validation-report.json' });
}

/* ------------------------------------------------------------------ */
/* 匯入                                                                 */
/* ------------------------------------------------------------------ */

export async function importJson(): Promise<void> {
  const file = await pickTextFile('.json,.ai-presentation,application/json');
  if (!file) return;
  const result = parsePresentationJson(file.text);
  if (!result.ok || !result.presentation) {
    editorStore.toast({
      tone: 'error',
      title: `無法匯入 ${file.name}`,
      detail: result.errors.slice(0, 3).join('　'),
    });
    editorStore.openDialog({ kind: 'validation', report: result.report });
    return;
  }
  editorStore.replacePresentation(result.presentation, { resetHistory: true });
  editorStore.toast({
    tone: 'success',
    title: `已匯入 ${file.name}`,
    detail: `${result.report.slides} 張投影片、${result.report.aiTasks.total} 個 AI 任務。`,
  });
}

/** 匯入外部 AI 完成的結果：同時支援完整規格與 Patch 兩種格式。 */
export async function importCompleted(): Promise<void> {
  const file = await pickTextFile('.json,application/json');
  if (!file) return;

  let data: unknown;
  try {
    data = JSON.parse(file.text);
  } catch (err) {
    editorStore.toast({
      tone: 'error',
      title: 'JSON 格式錯誤',
      detail: (err as Error).message,
    });
    return;
  }

  const protocol = (data as { protocol?: string })?.protocol;

  if (protocol === PATCH_PROTOCOL) {
    const summary = editorStore.applyPresentationPatch(data as PresentationPatch);
    editorStore.openDialog({ kind: 'merge', title: `匯入 Patch：${file.name}`, summary });
    return;
  }

  if (protocol === PRESENTATION_PROTOCOL) {
    const result = parsePresentationJson(file.text);
    if (!result.presentation) {
      editorStore.toast({
        tone: 'error',
        title: `無法匯入 ${file.name}`,
        detail: result.errors.slice(0, 3).join('　'),
      });
      editorStore.openDialog({ kind: 'validation', report: result.report });
      return;
    }
    const summary = editorStore.importCompleted(result.presentation);
    editorStore.openDialog({
      kind: 'merge',
      title: `匯入 AI 完成結果：${file.name}`,
      summary,
    });
    return;
  }

  editorStore.toast({
    tone: 'error',
    title: '無法辨識的檔案格式',
    detail: `protocol 必須是 "${PRESENTATION_PROTOCOL}" 或 "${PATCH_PROTOCOL}"，實際為 ${JSON.stringify(protocol)}。`,
  });
}

/* ------------------------------------------------------------------ */
/* 模擬 AI（Demo 用，未連接任何 AI API）                                 */
/* ------------------------------------------------------------------ */

export function simulateAiCompletion(taskIds?: string[]): void {
  const presentation = currentPresentation();
  const patch = buildMockPatch(presentation, taskIds);
  if (patch.operations.length === 0) {
    editorStore.toast({ tone: 'info', title: '沒有待處理的 AI 任務' });
    return;
  }
  const summary = editorStore.applyPresentationPatch(patch);
  editorStore.toast({
    tone: 'warning',
    title: `模擬 AI 完成：${summary.applied} / ${patch.operations.length} 個任務`,
    detail: '這是本機產生的模擬內容，並未連接任何 AI 服務，請勿當成真實結果。',
  });
}

/** 匯出一份模擬的 completed-presentation.json，用來測試匯入流程。 */
export function exportMockCompleted(): void {
  const presentation = currentPresentation();
  const patch = buildMockPatch(presentation);
  downloadText(
    `${JSON.stringify(patch, null, 2)}\n`,
    'mock-ai-patch.json',
  );
  editorStore.toast({
    tone: 'warning',
    title: '已匯出模擬 AI Patch',
    detail: '內容為本機模擬資料，可用「匯入 AI 完成結果」測試回填流程。',
  });
}

export function resetToDemo(): void {
  editorStore.confirm({
    title: '重新載入示範簡報',
    message: '目前的內容會被示範簡報取代，而且無法復原。確定要繼續嗎？',
    confirmLabel: '重新載入',
    danger: true,
    onConfirm: () => editorStore.resetToDemo(),
  });
}

export function newPresentationFromBlank(): void {
  editorStore.confirm({
    title: '建立新簡報',
    message: '目前的內容會被清空，換成一張空白投影片。確定要繼續嗎？',
    confirmLabel: '建立新簡報',
    danger: true,
    onConfirm: () => {
      editorStore.replacePresentation(
        createPresentation({ slides: [createSlide({ title: '投影片 1' })] }),
        { resetHistory: true },
      );
      editorStore.toast({ tone: 'success', title: '已建立新簡報' });
    },
  });
}
