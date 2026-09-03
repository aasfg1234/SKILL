import type { Presentation, Slide } from '../model/types';

export interface EditableAuditSlide {
  slideId: string;
  nativeCount: number;
  svgCount: number;
  imageCount: number;
  issues: string[];
}

export interface EditableAuditReport {
  ok: boolean;
  nativeCount: number;
  svgCount: number;
  imageCount: number;
  slides: EditableAuditSlide[];
  issues: string[];
}

function isSvgText(content: string): boolean {
  return /<text\b|<foreignObject\b/i.test(content);
}

export function auditEditableSlide(slide: Slide, width: number, height: number): EditableAuditSlide {
  const issues: string[] = [];
  let nativeCount = 0;
  let svgCount = 0;
  let imageCount = 0;
  const groups = new Map<string, number>();

  for (const element of slide.elements) {
    if (element.groupId) groups.set(element.groupId, (groups.get(element.groupId) ?? 0) + 1);
    if (element.type === 'image') {
      imageCount += 1;
      if (element.width >= width * 0.9 && element.height >= height * 0.9) issues.push('發現整頁圖片。請改用可編輯元件。');
      continue;
    }
    if (element.type === 'ai_component') {
      const format = element.result?.type ?? element.outputFormat;
      if (format === 'svg') {
        svgCount += 1;
        if (element.width >= width * 0.9 && element.height >= height * 0.9) issues.push('發現整頁 SVG。請改用可編輯元件。');
        if (isSvgText(element.result?.content ?? '')) issues.push('發現包含文字的 SVG。請把文字拆成文字元件。');
      } else if (format === 'html') {
        issues.push('發現 HTML 元件。請改用可編輯元件。');
      } else if (format === 'image') {
        imageCount += 1;
        if (element.width >= width * 0.9 && element.height >= height * 0.9) issues.push('發現整頁圖片。請改用可編輯元件。');
      } else {
        issues.push('發現尚未轉成原生元件的 AI 元件。');
      }
      continue;
    }
    nativeCount += 1;
  }

  for (const [groupId, count] of groups) {
    if (count < 2) issues.push(`群組 ${groupId} 只有一個元件。請取消群組或補齊成員。`);
  }
  if (slide.elements.length > 0 && slide.elements.every((element) => element.locked)) issues.push('所有元件都被鎖定。請保留直接編輯能力。');

  return { slideId: slide.id, nativeCount, svgCount, imageCount, issues };
}

export function auditEditablePresentation(presentation: Presentation): EditableAuditReport {
  const slides = presentation.slides.map((slide) => auditEditableSlide(slide, presentation.settings.width, presentation.settings.height));
  const issues = slides.flatMap((slide, index) => slide.issues.map((issue) => `第 ${index + 1} 頁：${issue}`));
  return {
    ok: issues.length === 0,
    nativeCount: slides.reduce((sum, slide) => sum + slide.nativeCount, 0),
    svgCount: slides.reduce((sum, slide) => sum + slide.svgCount, 0),
    imageCount: slides.reduce((sum, slide) => sum + slide.imageCount, 0),
    slides,
    issues,
  };
}
