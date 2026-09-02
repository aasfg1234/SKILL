import type { Presentation } from './types';

/**
 * 全簡報的文字搜尋與取代。
 *
 * 搜尋範圍：投影片標題、投影片備註、文字元素的內容，以及表格的每一個儲存格。
 * 不會動到 AI 元件的 Prompt，避免把交給外部 AI 的指示改壞。
 */

export interface SearchOptions {
  caseSensitive?: boolean;
}

/** 命中的位置：投影片標題、投影片備註，或某一個元素。 */
export type SearchField = 'title' | 'notes' | 'element';

export interface SearchHit {
  slideId: string;
  slideIndex: number;
  field: SearchField;
  /** 標題與備註沒有對應的元素，所以是 null */
  elementId: string | null;
  /** 這個位置裡出現幾次 */
  count: number;
  /** 給使用者看的一小段內容 */
  preview: string;
}

function countOccurrences(
  haystack: string,
  needle: string,
  caseSensitive: boolean,
): number {
  if (!needle) return 0;
  const source = caseSensitive ? haystack : haystack.toLowerCase();
  const target = caseSensitive ? needle : needle.toLowerCase();
  let count = 0;
  let from = 0;
  for (;;) {
    const index = source.indexOf(target, from);
    if (index < 0) break;
    count += 1;
    from = index + target.length;
  }
  return count;
}

function replaceAllText(
  haystack: string,
  needle: string,
  replacement: string,
  caseSensitive: boolean,
): string {
  if (!needle) return haystack;
  const source = caseSensitive ? haystack : haystack.toLowerCase();
  const target = caseSensitive ? needle : needle.toLowerCase();
  let result = '';
  let from = 0;
  for (;;) {
    const index = source.indexOf(target, from);
    if (index < 0) break;
    result += haystack.slice(from, index) + replacement;
    from = index + target.length;
  }
  return result + haystack.slice(from);
}

function preview(text: string): string {
  const line = text.split('\n').find((item) => item.trim() !== '') ?? '';
  return line.length > 40 ? `${line.slice(0, 40)}…` : line;
}

/** 找出每個含有搜尋字串的元素。查無結果或搜尋字串空白時回傳空陣列。 */
export function findInPresentation(
  presentation: Presentation,
  query: string,
  options: SearchOptions = {},
): SearchHit[] {
  const needle = String(query ?? '');
  if (needle.trim() === '') return [];
  const caseSensitive = options.caseSensitive === true;
  const hits: SearchHit[] = [];

  presentation.slides.forEach((slide, slideIndex) => {
    const titleCount = countOccurrences(slide.title, needle, caseSensitive);
    if (titleCount > 0) {
      hits.push({
        slideId: slide.id,
        slideIndex,
        field: 'title',
        elementId: null,
        count: titleCount,
        preview: preview(slide.title),
      });
    }

    const notesCount = countOccurrences(slide.notes, needle, caseSensitive);
    if (notesCount > 0) {
      hits.push({
        slideId: slide.id,
        slideIndex,
        field: 'notes',
        elementId: null,
        count: notesCount,
        preview: preview(slide.notes),
      });
    }

    for (const el of slide.elements) {
      if (el.type === 'text') {
        const count = countOccurrences(el.text, needle, caseSensitive);
        if (count > 0) {
          hits.push({
            slideId: slide.id,
            slideIndex,
            field: 'element',
            elementId: el.id,
            count,
            preview: preview(el.text),
          });
        }
      } else if (el.type === 'table') {
        const flat = el.cells.flat();
        const count = flat.reduce(
          (sum, cell) => sum + countOccurrences(cell, needle, caseSensitive),
          0,
        );
        if (count > 0) {
          hits.push({
            slideId: slide.id,
            slideIndex,
            field: 'element',
            elementId: el.id,
            count,
            preview: preview(
              flat.filter((cell) => cell.trim() !== '').join('｜'),
            ),
          });
        }
      }
    }
  });

  return hits;
}

/** 全部取代。回傳新的簡報與取代次數；原本的簡報不會被改動。 */
export function replaceInPresentation(
  presentation: Presentation,
  query: string,
  replacement: string,
  options: SearchOptions = {},
): { presentation: Presentation; replaced: number } {
  const needle = String(query ?? '');
  if (needle.trim() === '') return { presentation, replaced: 0 };
  const caseSensitive = options.caseSensitive === true;
  const value = String(replacement ?? '');
  let replaced = 0;

  const next: Presentation = {
    ...presentation,
    slides: presentation.slides.map((slide) => {
      const titleCount = countOccurrences(slide.title, needle, caseSensitive);
      const notesCount = countOccurrences(slide.notes, needle, caseSensitive);
      replaced += titleCount + notesCount;

      return {
        ...slide,
        title:
          titleCount > 0
            ? replaceAllText(slide.title, needle, value, caseSensitive)
            : slide.title,
        notes:
          notesCount > 0
            ? replaceAllText(slide.notes, needle, value, caseSensitive)
            : slide.notes,
        elements: slide.elements.map((el) => {
          if (el.type === 'text') {
            const count = countOccurrences(el.text, needle, caseSensitive);
            if (count === 0) return el;
            replaced += count;
            return {
              ...el,
              text: replaceAllText(el.text, needle, value, caseSensitive),
            };
          }
          if (el.type === 'table') {
            const count = el.cells
              .flat()
              .reduce(
                (sum, cell) =>
                  sum + countOccurrences(cell, needle, caseSensitive),
                0,
              );
            if (count === 0) return el;
            replaced += count;
            return {
              ...el,
              cells: el.cells.map((line) =>
                line.map((cell) =>
                  replaceAllText(cell, needle, value, caseSensitive),
                ),
              ),
            };
          }
          return el;
        }),
      };
    }),
  };

  return replaced > 0
    ? { presentation: next, replaced }
    : { presentation, replaced: 0 };
}
