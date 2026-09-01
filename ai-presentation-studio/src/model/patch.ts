import {
  PATCH_PROTOCOL,
  PRESENTATION_PROTOCOL,
  type AIComponentElement,
  type AIOutput,
  type Presentation,
  type PresentationPatch,
  type Slide,
  type SlideElement,
} from './types';
import { sanitizeAiOutput } from './sanitize';
import { syncAiTasks } from './factory';

/**
 * AI 回填層。
 *
 * 外部 AI 不需要重建整份簡報，只要回傳 Patch 或 Completed Presentation，
 * 本模組負責把結果安全地寫回指定 slide / element，並保留所有非 AI 元件。
 */

export type MergeOutcome = 'applied' | 'skipped' | 'failed';

export interface MergeDetail {
  taskId?: string;
  elementId?: string;
  slideId?: string;
  outcome: MergeOutcome;
  message: string;
}

export interface MergeSummary {
  total: number;
  applied: number;
  skipped: number;
  failed: number;
  /** 全部成功 / 部分成功 / 全部失敗 */
  status: 'success' | 'partial' | 'failed';
  details: MergeDetail[];
  /** 被安全機制移除的內容（例如 <script>） */
  sanitized: string[];
}

export interface MergeResult {
  presentation: Presentation;
  summary: MergeSummary;
}

function finalizeSummary(summary: MergeSummary): MergeSummary {
  if (summary.failed === 0 && summary.applied > 0) summary.status = 'success';
  else if (summary.applied > 0) summary.status = 'partial';
  else if (summary.total === 0) summary.status = 'success';
  else summary.status = 'failed';
  summary.sanitized = [...new Set(summary.sanitized)];
  return summary;
}

function emptySummary(): MergeSummary {
  return {
    total: 0,
    applied: 0,
    skipped: 0,
    failed: 0,
    status: 'success',
    details: [],
    sanitized: [],
  };
}

function findElement(
  presentation: Presentation,
  elementId: string,
): { slide: Slide; element: SlideElement } | undefined {
  for (const slide of presentation.slides) {
    const element = slide.elements.find((el) => el.id === elementId);
    if (element) return { slide, element };
  }
  return undefined;
}

function replaceElement(
  presentation: Presentation,
  slideId: string,
  elementId: string,
  next: SlideElement,
): Presentation {
  return {
    ...presentation,
    slides: presentation.slides.map((slide) =>
      slide.id !== slideId
        ? slide
        : {
            ...slide,
            elements: slide.elements.map((el) => (el.id === elementId ? next : el)),
          },
    ),
  };
}

/** 把單一 AI 輸出安全寫入指定的 AI 元件。 */
export function applyAiOutput(
  presentation: Presentation,
  elementId: string,
  output: AIOutput,
  summary: MergeSummary,
  taskId?: string,
): Presentation {
  const found = findElement(presentation, elementId);
  if (!found) {
    summary.failed += 1;
    summary.details.push({
      taskId,
      elementId,
      outcome: 'failed',
      message: `找不到目標元素 ${elementId}，此結果已略過。`,
    });
    return presentation;
  }
  if (found.element.type !== 'ai_component') {
    summary.failed += 1;
    summary.details.push({
      taskId,
      elementId,
      slideId: found.slide.id,
      outcome: 'failed',
      message: `元素 ${elementId} 不是 AI 元件，為保護既有內容已拒絕寫入。`,
    });
    return presentation;
  }
  if (found.element.locked) {
    summary.skipped += 1;
    summary.details.push({
      taskId,
      elementId,
      slideId: found.slide.id,
      outcome: 'skipped',
      message: `元素 ${elementId} 已鎖定，未套用 AI 結果。`,
    });
    return presentation;
  }

  const format = output?.type ?? found.element.outputFormat;
  const clean = sanitizeAiOutput(format, String(output?.content ?? ''));
  summary.sanitized.push(...clean.removed);

  if (!clean.content.trim()) {
    summary.failed += 1;
    summary.details.push({
      taskId,
      elementId,
      slideId: found.slide.id,
      outcome: 'failed',
      message: `元素 ${elementId} 的 AI 結果為空或不安全，已拒絕套用。`,
    });
    return presentation;
  }

  const next: AIComponentElement = {
    ...found.element,
    outputFormat: format,
    status: 'completed',
    result: {
      type: format,
      content: clean.content,
      producer: output?.producer ?? 'external-ai',
      producedAt: output?.producedAt ?? new Date().toISOString(),
    },
  };
  delete next.errorMessage;

  summary.applied += 1;
  summary.details.push({
    taskId: taskId ?? found.element.taskId,
    elementId,
    slideId: found.slide.id,
    outcome: 'applied',
    message: `已寫入投影片「${found.slide.title}」的 ${elementId}${
      clean.removed.length ? `（已移除不安全內容：${clean.removed.join('、')}）` : ''
    }`,
  });

  return replaceElement(presentation, found.slide.id, elementId, next);
}

const PROTECTED_KEYS = new Set(['id', 'type', 'taskId']);

/** 套用一份 PresentationPatch。 */
export function applyPatch(
  presentation: Presentation,
  patch: PresentationPatch,
): MergeResult {
  const summary = emptySummary();
  let next = presentation;

  if (patch.protocol !== PATCH_PROTOCOL) {
    summary.failed += 1;
    summary.total = 1;
    summary.details.push({
      outcome: 'failed',
      message: `Patch 協定不符：預期 "${PATCH_PROTOCOL}"，實際為 ${JSON.stringify(patch.protocol)}。`,
    });
    return { presentation, summary: finalizeSummary(summary) };
  }

  const operations = Array.isArray(patch.operations) ? patch.operations : [];
  summary.total = operations.length;

  for (const op of operations) {
    switch (op?.operation) {
      case 'replace_ai_output': {
        next = applyAiOutput(next, op.targetElementId, op.output, summary, op.taskId);
        break;
      }
      case 'add_element': {
        const slide = next.slides.find((s) => s.id === op.slideId);
        if (!slide) {
          summary.failed += 1;
          summary.details.push({
            outcome: 'failed',
            message: `add_element 失敗：找不到投影片 ${op.slideId}。`,
          });
          break;
        }
        if (!op.element?.id || findElement(next, op.element.id)) {
          summary.failed += 1;
          summary.details.push({
            outcome: 'failed',
            message: `add_element 失敗：元素 ID ${op.element?.id ?? '(空白)'} 無效或已存在。`,
          });
          break;
        }
        next = {
          ...next,
          slides: next.slides.map((s) =>
            s.id === op.slideId ? { ...s, elements: [...s.elements, op.element] } : s,
          ),
        };
        summary.applied += 1;
        summary.details.push({
          slideId: op.slideId,
          elementId: op.element.id,
          outcome: 'applied',
          message: `已新增元素 ${op.element.id}。`,
        });
        break;
      }
      case 'update_element': {
        const found = findElement(next, op.elementId);
        if (!found) {
          summary.failed += 1;
          summary.details.push({
            outcome: 'failed',
            elementId: op.elementId,
            message: `update_element 失敗：找不到元素 ${op.elementId}。`,
          });
          break;
        }
        if (found.element.locked) {
          summary.skipped += 1;
          summary.details.push({
            outcome: 'skipped',
            elementId: op.elementId,
            message: `元素 ${op.elementId} 已鎖定，未套用變更。`,
          });
          break;
        }
        const patched: Record<string, unknown> = { ...found.element };
        for (const [key, value] of Object.entries(op.props ?? {})) {
          if (PROTECTED_KEYS.has(key)) continue;
          patched[key] = value;
        }
        next = replaceElement(
          next,
          found.slide.id,
          found.element.id,
          patched as unknown as SlideElement,
        );
        summary.applied += 1;
        summary.details.push({
          outcome: 'applied',
          slideId: found.slide.id,
          elementId: op.elementId,
          message: `已更新元素 ${op.elementId}。`,
        });
        break;
      }
      case 'delete_element': {
        const found = findElement(next, op.elementId);
        if (!found) {
          summary.failed += 1;
          summary.details.push({
            outcome: 'failed',
            elementId: op.elementId,
            message: `delete_element 失敗：找不到元素 ${op.elementId}。`,
          });
          break;
        }
        if (found.element.locked) {
          summary.skipped += 1;
          summary.details.push({
            outcome: 'skipped',
            elementId: op.elementId,
            message: `元素 ${op.elementId} 已鎖定，未刪除。`,
          });
          break;
        }
        next = {
          ...next,
          slides: next.slides.map((s) =>
            s.id !== found.slide.id
              ? s
              : { ...s, elements: s.elements.filter((el) => el.id !== op.elementId) },
          ),
        };
        summary.applied += 1;
        summary.details.push({
          outcome: 'applied',
          slideId: found.slide.id,
          elementId: op.elementId,
          message: `已刪除元素 ${op.elementId}。`,
        });
        break;
      }
      default: {
        summary.failed += 1;
        summary.details.push({
          outcome: 'failed',
          message: `不支援的操作：${String((op as { operation?: string })?.operation)}`,
        });
      }
    }
  }

  return { presentation: syncAiTasks(next), summary: finalizeSummary(summary) };
}

/**
 * 匯入外部 AI 完成的 completed-presentation.json。
 *
 * 只擷取 AI 任務的結果與狀態，非 AI 元件一律沿用目前編輯器中的版本，
 * 因此外部 AI 即使誤改了其他內容也不會污染使用者的簡報。
 */
export function mergeCompletedPresentation(
  current: Presentation,
  completed: Presentation,
): MergeResult {
  const summary = emptySummary();
  let next = current;

  if (completed.protocol !== PRESENTATION_PROTOCOL) {
    summary.total = 1;
    summary.failed = 1;
    summary.details.push({
      outcome: 'failed',
      message: `協定不符：預期 "${PRESENTATION_PROTOCOL}"。`,
    });
    return { presentation: current, summary: finalizeSummary(summary) };
  }

  // 以 AI 元件為準蒐集所有回傳結果（同時支援 aiTasks 與 slides 內的 result）
  const incoming = new Map<
    string,
    { elementId: string; slideId: string; status?: string; result?: AIOutput; error?: string }
  >();

  for (const slide of completed.slides ?? []) {
    for (const el of slide.elements ?? []) {
      if (el.type !== 'ai_component') continue;
      incoming.set(el.taskId || el.id, {
        elementId: el.id,
        slideId: slide.id,
        status: el.status,
        result: el.result,
        error: el.errorMessage,
      });
    }
  }
  for (const task of completed.aiTasks ?? []) {
    const existing = incoming.get(task.id);
    const merged = {
      elementId: task.target?.elementId ?? existing?.elementId ?? '',
      slideId: task.target?.slideId ?? existing?.slideId ?? '',
      status: task.status ?? existing?.status,
      result: task.result ?? existing?.result,
      error: task.errorMessage ?? existing?.error,
    };
    incoming.set(task.id, merged);
  }

  summary.total = incoming.size;

  for (const [taskId, item] of incoming) {
    const found = findElement(next, item.elementId);
    if (!found) {
      summary.failed += 1;
      summary.details.push({
        taskId,
        elementId: item.elementId,
        outcome: 'failed',
        message: `目前簡報中沒有元素 ${item.elementId}，此任務結果無法套用。`,
      });
      continue;
    }
    if (found.slide.id !== item.slideId && item.slideId) {
      summary.failed += 1;
      summary.details.push({
        taskId,
        elementId: item.elementId,
        outcome: 'failed',
        message: `元素 ${item.elementId} 不在投影片 ${item.slideId} 上，已拒絕套用以免錯置。`,
      });
      continue;
    }

    if (item.status === 'error') {
      if (found.element.type === 'ai_component') {
        next = replaceElement(next, found.slide.id, found.element.id, {
          ...found.element,
          status: 'error',
          errorMessage: item.error || '外部 AI 回報此任務處理失敗。',
        });
      }
      summary.failed += 1;
      summary.details.push({
        taskId,
        elementId: item.elementId,
        slideId: found.slide.id,
        outcome: 'failed',
        message: `外部 AI 回報失敗：${item.error || '未提供原因'}`,
      });
      continue;
    }

    if (!item.result || !String(item.result.content ?? '').trim()) {
      summary.skipped += 1;
      summary.details.push({
        taskId,
        elementId: item.elementId,
        slideId: found.slide.id,
        outcome: 'skipped',
        message: `任務 ${taskId} 尚未完成（沒有輸出結果），維持原狀。`,
      });
      continue;
    }

    next = applyAiOutput(next, item.elementId, item.result, summary, taskId);
  }

  return { presentation: syncAiTasks(next), summary: finalizeSummary(summary) };
}

/** 由目前簡報產生一份「待辦」Patch 範本，方便外部 AI 直接填寫。 */
export function createPatchTemplate(presentation: Presentation): PresentationPatch {
  return {
    protocol: PATCH_PROTOCOL,
    presentationId: presentation.metadata.id,
    generatedAt: new Date().toISOString(),
    operations: presentation.aiTasks
      .filter((task) => task.status === 'pending' || task.status === 'error')
      .map((task) => ({
        operation: 'replace_ai_output' as const,
        taskId: task.id,
        targetElementId: task.target.elementId,
        output: {
          type: task.outputFormat,
          content: '',
        },
      })),
  };
}
