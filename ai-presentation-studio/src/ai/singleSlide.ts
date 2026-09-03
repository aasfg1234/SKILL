import { newElementId, newGroupId, newSlideId } from '../model/ids';
import { createSlide } from '../model/factory';
import type { Presentation, Slide, SlideElement, TextElement } from '../model/types';
import type { SingleSlideContext, SingleSlideForm } from './types';

export const DEFAULT_SINGLE_SLIDE_FORM: SingleSlideForm = {
  topic: '',
  keyMessage: '',
  pageType: 'auto',
  visualStyle: 'follow',
  referenceContent: '',
  extraRequest: '',
  generateNotes: true,
};

export function validateSingleSlideForm(form: SingleSlideForm): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.topic.trim()) errors.topic = '請填寫本頁主題。';
  if (!form.keyMessage.trim()) errors.keyMessage = '請填寫本頁要表達的重點。';
  return errors;
}

function slideSummary(slide: Slide | undefined): string {
  if (!slide) return '';
  const parts = slide.elements.flatMap((element) => {
    if (element.type === 'text') return [element.text];
    if (element.type === 'table') return element.cells.flat();
    if (element.type === 'chart') return [element.title, ...element.labels];
    return [];
  }).map((text) => text.trim()).filter(Boolean);
  return parts.join('；').slice(0, 240);
}

export function buildSingleSlideContext(
  presentation: Presentation,
  currentSlideId: string,
  selectedSlideIds: string[],
): SingleSlideContext {
  const selectedIndexes = selectedSlideIds.map((id) => presentation.slides.findIndex((slide) => slide.id === id)).filter((index) => index >= 0);
  const currentIndex = presentation.slides.findIndex((slide) => slide.id === currentSlideId);
  const anchorIndex = selectedIndexes.length ? Math.max(...selectedIndexes) : Math.max(0, currentIndex);
  const anchor = presentation.slides[anchorIndex] ?? presentation.slides[0];
  return {
    presentationId: presentation.metadata.id,
    presentationTitle: presentation.metadata.title,
    language: '繁體中文',
    width: presentation.settings.width,
    height: presentation.settings.height,
    primaryColor: presentation.theme.palette.primary,
    secondaryColor: presentation.theme.palette.accent,
    fontFamily: presentation.theme.fontFamily,
    contentMaster: {
      ...structuredClone(presentation.masters?.content ?? createSlide({ title: '內容母片', elements: [] })),
      masterKind: 'content',
    },
    previousTitle: anchor?.title ?? '',
    nextTitle: presentation.slides[anchorIndex + 1]?.title ?? '',
    previousSummary: slideSummary(anchor),
    insertAfterSlideId: anchor?.id ?? '',
    insertIndex: anchorIndex + 1,
    showSlideNumbers: presentation.settings.showSlideNumbers === true,
  };
}

export interface SingleSlideValidation {
  ok: boolean;
  errors: string[];
}

function overlaps(a: TextElement, b: TextElement): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function validateSingleSlideCandidate(slide: Slide, context: SingleSlideContext): SingleSlideValidation {
  const errors: string[] = [];
  if (!slide || !Array.isArray(slide.elements) || slide.elements.length === 0) errors.push('AI 回傳空白頁面。請調整重點後重新生成。');
  const ids = new Set<string>();
  for (const element of slide?.elements ?? []) {
    if (!element.id || ids.has(element.id)) errors.push('AI 回傳重複的元素 ID。請重新生成。');
    ids.add(element.id);
    if (element.x < 0 || element.y < 0 || element.width <= 0 || element.height <= 0 || element.x + element.width > context.width || element.y + element.height > context.height) {
      errors.push(`元素「${element.name ?? element.id}」超出畫布。請重新生成。`);
    }
    if (context.showSlideNumbers && element.y + element.height > context.height - 65 && element.x + element.width > context.width - 180) {
      errors.push('元素遮住頁碼位置。請重新生成。');
    }
    if (element.type === 'chart' && (element.labels.length === 0 || element.series.length === 0 || element.series.some((series) => series.values.some((value) => !Number.isFinite(value))))) {
      errors.push('圖表資料格式不正確。請修改資料或重新生成。');
    }
    if (element.type === 'table' && (element.cells.length === 0 || element.cells.some((row) => row.length === 0) || element.columnWidths.length !== element.cells[0]?.length)) {
      errors.push('表格資料格式不正確。請修改資料或重新生成。');
    }
  }
  const texts = (slide?.elements ?? []).filter((element): element is TextElement => element.type === 'text');
  for (let i = 0; i < texts.length; i += 1) for (let j = i + 1; j < texts.length; j += 1) if (overlaps(texts[i], texts[j])) errors.push('文字框互相重疊。請減少文字或重新生成。');
  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}

export function rekeySingleSlide(slide: Slide): Slide {
  const groups = new Map<string, string>();
  const elements: SlideElement[] = slide.elements.map((element) => {
    const next = structuredClone(element);
    next.id = newElementId(element.type);
    if (element.groupId) {
      const groupId = groups.get(element.groupId) ?? newGroupId();
      groups.set(element.groupId, groupId);
      next.groupId = groupId;
    }
    return next;
  });
  return { ...structuredClone(slide), id: newSlideId(), masterKind: 'content', useMasterBackground: true, elements };
}
