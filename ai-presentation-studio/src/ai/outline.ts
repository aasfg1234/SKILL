import { newId } from '../model/ids';
import type { OutlineSlide, PresentationOutline } from './types';

export function createOutlineSlide(index: number): OutlineSlide {
  return {
    id: newId('outline'),
    title: `新增投影片 ${index + 1}`,
    summary: '請在這裡補上本頁重點。',
    layoutId: 'title-content',
    visualSuggestion: '重點文字',
    notesSummary: '說明本頁重點。',
    locked: false,
  };
}

export function moveOutlineSlide(
  slides: OutlineSlide[],
  dragId: string,
  targetId: string,
): OutlineSlide[] {
  const from = slides.findIndex((slide) => slide.id === dragId);
  const to = slides.findIndex((slide) => slide.id === targetId);
  if (from < 0 || to < 0 || from === to) return slides;
  const next = [...slides];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export function addOutlineSlide(outline: PresentationOutline): PresentationOutline {
  return { ...outline, slides: [...outline.slides, createOutlineSlide(outline.slides.length)] };
}

export function deleteOutlineSlide(outline: PresentationOutline, id: string): PresentationOutline {
  if (outline.slides.length <= 1) return outline;
  return { ...outline, slides: outline.slides.filter((slide) => slide.id !== id) };
}

export function updateOutlineSlide(
  outline: PresentationOutline,
  id: string,
  props: Partial<OutlineSlide>,
): PresentationOutline {
  return {
    ...outline,
    slides: outline.slides.map((slide) => slide.id === id ? { ...slide, ...props } : slide),
  };
}

export function isPresentationOutline(value: unknown): value is PresentationOutline {
  const outline = value as PresentationOutline | null;
  return Boolean(
    outline &&
    typeof outline.title === 'string' &&
    typeof outline.subtitle === 'string' &&
    Array.isArray(outline.slides) &&
    outline.slides.length > 0 &&
    outline.slides.every((slide) =>
      slide && typeof slide.id === 'string' && typeof slide.title === 'string' &&
      typeof slide.summary === 'string' && typeof slide.layoutId === 'string'),
  );
}

