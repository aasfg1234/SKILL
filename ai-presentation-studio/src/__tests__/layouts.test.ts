import { describe, expect, it } from 'vitest';
import { SLIDE_LAYOUTS, buildLayoutElements } from '../model/layouts';

const OPTIONS = { width: 1920, height: 1080, accent: '#4F46E5' };

function overlaps(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

describe('投影片版型', () => {
  it('提供空白、標題頁、標題加內容、兩欄、圖文五種版型', () => {
    expect(SLIDE_LAYOUTS.map((layout) => layout.id)).toEqual([
      'blank',
      'title',
      'title-content',
      'two-column',
      'image-text',
    ]);
  });

  it('空白版型不放任何元素', () => {
    expect(buildLayoutElements('blank', OPTIONS)).toEqual([]);
  });

  it('每一種版型的元素都留在投影片範圍內', () => {
    for (const layout of SLIDE_LAYOUTS) {
      for (const el of buildLayoutElements(layout.id, OPTIONS)) {
        expect(el.x).toBeGreaterThanOrEqual(0);
        expect(el.y).toBeGreaterThanOrEqual(0);
        expect(el.x + el.width).toBeLessThanOrEqual(OPTIONS.width);
        expect(el.y + el.height).toBeLessThanOrEqual(OPTIONS.height);
      }
    }
  });

  it('每一種版型的元素 ID 與層次都不重複', () => {
    for (const layout of SLIDE_LAYOUTS) {
      const elements = buildLayoutElements(layout.id, OPTIONS);
      expect(new Set(elements.map((el) => el.id)).size).toBe(elements.length);
      expect(new Set(elements.map((el) => el.z)).size).toBe(elements.length);
    }
  });

  it('兩欄版型的左右兩欄不會互相重疊', () => {
    const columns = buildLayoutElements('two-column', OPTIONS).filter(
      (el) => el.type === 'text' && el.fontSize < 60,
    );

    expect(columns).toHaveLength(2);
    expect(overlaps(columns[0], columns[1])).toBe(false);
  });

  it('圖文版型有一個圖片框，而且不會壓到文字', () => {
    const elements = buildLayoutElements('image-text', OPTIONS);
    const image = elements.filter((el) => el.type === 'image');
    const body = elements.find((el) => el.type === 'text' && el.fontSize < 60);

    expect(image).toHaveLength(1);
    expect(body).toBeDefined();
    expect(overlaps(image[0], body!)).toBe(false);
  });

  it('未知的版型代號當成空白處理', () => {
    expect(buildLayoutElements('not-exists', OPTIONS)).toEqual([]);
  });
});
