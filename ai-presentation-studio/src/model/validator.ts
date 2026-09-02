import {
  PRESENTATION_PROTOCOL,
  type Presentation,
  type ValidationIssue,
  type ValidationReport,
} from './types';

/**
 * Presentation Specification 驗證器。
 * 不依賴 React 或 DOM，可在瀏覽器、Node、外部工具中重複使用。
 */

function emptyReport(): ValidationReport {
  return {
    status: 'success',
    protocol: PRESENTATION_PROTOCOL,
    checkedAt: new Date().toISOString(),
    slides: 0,
    elements: 0,
    aiTasks: { total: 0, pending: 0, processing: 0, completed: 0, failed: 0 },
    validation: {
      outOfBounds: 0,
      missingTargets: 0,
      duplicateIds: 0,
      invalidSize: 0,
      orphanTasks: 0,
    },
    issues: [],
  };
}

function finalize(report: ValidationReport): ValidationReport {
  const hasError = report.issues.some((i) => i.severity === 'error');
  const hasWarning = report.issues.some((i) => i.severity === 'warning');
  report.status = hasError ? 'error' : hasWarning ? 'warning' : 'success';
  return report;
}

/** 對已知型別的 Presentation 做完整檢查。 */
export function validatePresentation(presentation: Presentation): ValidationReport {
  const report = emptyReport();
  const issues: ValidationIssue[] = report.issues;

  if (presentation.protocol !== PRESENTATION_PROTOCOL) {
    issues.push({
      code: 'PROTOCOL_MISMATCH',
      severity: 'error',
      message: `協定不符：預期 ${PRESENTATION_PROTOCOL}，實際為 ${String(presentation.protocol)}`,
    });
  }

  const { width, height } = presentation.settings ?? { width: 0, height: 0 };
  if (!(width > 0) || !(height > 0)) {
    report.validation.invalidSize += 1;
    issues.push({
      code: 'INVALID_SLIDE_SIZE',
      severity: 'error',
      message: `簡報尺寸不合法：寬 ${width} × 高 ${height}，兩者都必須大於 0`,
    });
  }

  const slides = Array.isArray(presentation.slides) ? presentation.slides : [];
  if (slides.length === 0) {
    issues.push({
      code: 'NO_SLIDES',
      severity: 'error',
      message: '簡報中沒有任何投影片',
    });
  }
  report.slides = slides.length;

  const slideIds = new Set<string>();
  const elementIds = new Set<string>();
  const elementSlide = new Map<string, string>();
  const aiElementTaskIds = new Map<string, { slideId: string; elementId: string }>();

  for (const slide of slides) {
    if (!slide.id) {
      issues.push({
        code: 'MISSING_SLIDE_ID',
        severity: 'error',
        message: '有投影片缺少 ID',
      });
      continue;
    }
    if (slideIds.has(slide.id)) {
      report.validation.duplicateIds += 1;
      issues.push({
        code: 'DUPLICATE_SLIDE_ID',
        severity: 'error',
        message: `投影片 ID 重複：${slide.id}`,
        slideId: slide.id,
      });
    }
    slideIds.add(slide.id);

    const elements = Array.isArray(slide.elements) ? slide.elements : [];
    report.elements += elements.length;

    for (const el of elements) {
      if (!el.id) {
        issues.push({
          code: 'MISSING_ELEMENT_ID',
          severity: 'error',
          message: `投影片 ${slide.id} 中有元素缺少 ID`,
          slideId: slide.id,
        });
        continue;
      }
      if (elementIds.has(el.id)) {
        report.validation.duplicateIds += 1;
        issues.push({
          code: 'DUPLICATE_ELEMENT_ID',
          severity: 'error',
          message: `元素 ID 重複：${el.id}`,
          slideId: slide.id,
          elementId: el.id,
        });
      }
      elementIds.add(el.id);
      elementSlide.set(el.id, slide.id);

      if (el.groupId !== undefined && (typeof el.groupId !== 'string' || !el.groupId.trim())) {
        issues.push({
          code: 'INVALID_GROUP_ID',
          severity: 'error',
          message: `元素 ${el.id} 的群組 ID 不合法`,
          slideId: slide.id,
          elementId: el.id,
        });
      }
      if (el.groupName !== undefined && typeof el.groupName !== 'string') {
        issues.push({
          code: 'INVALID_GROUP_NAME',
          severity: 'error',
          message: `元素 ${el.id} 的群組名稱不合法`,
          slideId: slide.id,
          elementId: el.id,
        });
      }

      if (!(el.width > 0) || !(el.height > 0)) {
        report.validation.invalidSize += 1;
        issues.push({
          code: 'INVALID_ELEMENT_SIZE',
          severity: 'error',
          message: `元素 ${el.id} 的寬高不合法（${el.width} × ${el.height}）`,
          slideId: slide.id,
          elementId: el.id,
        });
      }

      const radians = (el.rotation * Math.PI) / 180;
      const visualWidth =
        Math.abs(el.width * Math.cos(radians)) + Math.abs(el.height * Math.sin(radians));
      const visualHeight =
        Math.abs(el.width * Math.sin(radians)) + Math.abs(el.height * Math.cos(radians));
      const centerX = el.x + el.width / 2;
      const centerY = el.y + el.height / 2;
      const visualX = centerX - visualWidth / 2;
      const visualY = centerY - visualHeight / 2;
      const outOfBounds =
        visualX < 0 ||
        visualY < 0 ||
        visualX + visualWidth > width ||
        visualY + visualHeight > height;
      if (outOfBounds) {
        report.validation.outOfBounds += 1;
        issues.push({
          code: 'ELEMENT_OUT_OF_BOUNDS',
          severity: 'warning',
          message: `元素 ${el.id} 的顯示範圍超出投影片`,
          slideId: slide.id,
          elementId: el.id,
        });
      }

      if (el.type === 'ai_component') {
        if (!el.taskId) {
          issues.push({
            code: 'AI_ELEMENT_WITHOUT_TASK_ID',
            severity: 'error',
            message: `AI 元件 ${el.id} 沒有對應的任務 ID`,
            slideId: slide.id,
            elementId: el.id,
          });
        } else {
          if (aiElementTaskIds.has(el.taskId)) {
            report.validation.duplicateIds += 1;
            issues.push({
              code: 'DUPLICATE_TASK_ID',
              severity: 'error',
              message: `AI 任務 ID 重複：${el.taskId}`,
              slideId: slide.id,
              elementId: el.id,
              taskId: el.taskId,
            });
          }
          aiElementTaskIds.set(el.taskId, { slideId: slide.id, elementId: el.id });
        }
        if (!el.prompt || !el.prompt.trim()) {
          issues.push({
            code: 'EMPTY_PROMPT',
            severity: 'warning',
            message: `AI 元件 ${el.id} 尚未填寫 Prompt，外部 AI 無法判斷要生成什麼`,
            slideId: slide.id,
            elementId: el.id,
            taskId: el.taskId,
          });
        }
      }
    }
  }

  const tasks = Array.isArray(presentation.aiTasks) ? presentation.aiTasks : [];
  report.aiTasks.total = tasks.length;
  const seenTaskIds = new Set<string>();

  for (const task of tasks) {
    switch (task.status) {
      case 'completed':
        report.aiTasks.completed += 1;
        break;
      case 'processing':
        report.aiTasks.processing += 1;
        break;
      case 'error':
        report.aiTasks.failed += 1;
        break;
      default:
        report.aiTasks.pending += 1;
    }

    if (seenTaskIds.has(task.id)) {
      report.validation.duplicateIds += 1;
      issues.push({
        code: 'DUPLICATE_TASK_ID',
        severity: 'error',
        message: `AI 任務 ID 重複：${task.id}`,
        taskId: task.id,
      });
    }
    seenTaskIds.add(task.id);

    if (!slideIds.has(task.target?.slideId)) {
      report.validation.missingTargets += 1;
      issues.push({
        code: 'TASK_TARGET_SLIDE_MISSING',
        severity: 'error',
        message: `AI 任務 ${task.id} 指向不存在的投影片：${task.target?.slideId}`,
        taskId: task.id,
      });
    }
    if (!elementIds.has(task.target?.elementId)) {
      report.validation.missingTargets += 1;
      issues.push({
        code: 'TASK_TARGET_ELEMENT_MISSING',
        severity: 'error',
        message: `AI 任務 ${task.id} 指向不存在的元素：${task.target?.elementId}`,
        taskId: task.id,
      });
    } else if (elementSlide.get(task.target.elementId) !== task.target.slideId) {
      report.validation.missingTargets += 1;
      issues.push({
        code: 'TASK_TARGET_MISMATCH',
        severity: 'error',
        message: `AI 任務 ${task.id} 的元素 ${task.target.elementId} 不在投影片 ${task.target.slideId} 上`,
        taskId: task.id,
      });
    }

    if (task.status === 'completed' && !task.result) {
      issues.push({
        code: 'COMPLETED_WITHOUT_RESULT',
        severity: 'warning',
        message: `AI 任務 ${task.id} 標記為已完成，但沒有輸出結果`,
        taskId: task.id,
      });
    }
  }

  // AI 元件存在但 aiTasks 缺少對應項目
  for (const [taskId, target] of aiElementTaskIds) {
    if (!seenTaskIds.has(taskId)) {
      report.validation.orphanTasks += 1;
      issues.push({
        code: 'MISSING_TASK_ENTRY',
        severity: 'warning',
        message: `AI 元件 ${target.elementId} 的任務 ${taskId} 未出現在 aiTasks 清單中`,
        slideId: target.slideId,
        elementId: target.elementId,
        taskId,
      });
    }
  }

  return finalize(report);
}

export interface ParseResult {
  ok: boolean;
  presentation?: Presentation;
  report: ValidationReport;
  /** 給使用者看的錯誤摘要（繁體中文） */
  errors: string[];
}

function structuralErrors(data: unknown): string[] {
  const errors: string[] = [];
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    errors.push('檔案內容不是一個 JSON 物件。');
    return errors;
  }
  const obj = data as Record<string, unknown>;
  if (obj.protocol !== PRESENTATION_PROTOCOL) {
    errors.push(
      `protocol 欄位不正確：預期 "${PRESENTATION_PROTOCOL}"，實際為 ${JSON.stringify(obj.protocol)}。`,
    );
  }
  if (!Array.isArray(obj.slides)) {
    errors.push('缺少 slides 陣列。');
  }
  if (typeof obj.settings !== 'object' || obj.settings === null) {
    errors.push('缺少 settings 物件（需包含 width 與 height）。');
  }
  if (obj.aiTasks !== undefined && !Array.isArray(obj.aiTasks)) {
    errors.push('aiTasks 必須是陣列。');
  }
  return errors;
}

/**
 * 解析並驗證外部 JSON 字串。
 * 一律先 JSON.parse + 結構檢查，絕不執行匯入內容中的任何程式碼。
 */
export function parsePresentationJson(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err) {
    return {
      ok: false,
      report: finalize({
        ...emptyReport(),
        issues: [
          {
            code: 'INVALID_JSON',
            severity: 'error',
            message: `JSON 格式錯誤：${(err as Error).message}`,
          },
        ],
      }),
      errors: [`JSON 格式錯誤：${(err as Error).message}`],
    };
  }

  const errors = structuralErrors(data);
  if (errors.length > 0) {
    return {
      ok: false,
      report: finalize({
        ...emptyReport(),
        issues: errors.map((message) => ({
          code: 'STRUCTURE_ERROR',
          severity: 'error' as const,
          message,
        })),
      }),
      errors,
    };
  }

  const presentation = data as Presentation;
  const report = validatePresentation(presentation);
  const hardErrors = report.issues.filter((i) => i.severity === 'error').map((i) => i.message);

  return {
    ok: hardErrors.length === 0,
    presentation,
    report,
    errors: hardErrors,
  };
}
