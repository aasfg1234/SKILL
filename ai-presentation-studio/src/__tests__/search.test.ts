import { describe, expect, it } from 'vitest';
import {
  createPresentation,
  createSlide,
  createTableElement,
  createTextElement,
} from '../model/factory';
import { findInPresentation, replaceInPresentation } from '../model/search';

function sample() {
  return createPresentation({
    slides: [
      createSlide({
        id: 'slide-01',
        title: '第一頁',
        elements: [
          createTextElement({ id: 'a', text: '雲端服務與雲端安全', z: 1 }),
          createTextElement({ id: 'b', text: 'Cloud 與 CLOUD', z: 2 }),
        ],
      }),
      createSlide({
        id: 'slide-02',
        title: '第二頁',
        elements: [
          createTableElement({
            id: 'c',
            rows: 1,
            columns: 2,
            cells: [['雲端', '地端']],
            z: 1,
          }),
        ],
      }),
    ],
  });
}

describe('搜尋與取代', () => {
  it('找得到文字元素裡的字，並回報出現次數與頁次', () => {
    const hits = findInPresentation(sample(), '雲端');

    expect(hits.map((hit) => hit.elementId)).toEqual(['a', 'c']);
    expect(hits[0]).toMatchObject({ slideId: 'slide-01', slideIndex: 0, count: 2 });
    expect(hits[1]).toMatchObject({ slideId: 'slide-02', slideIndex: 1, count: 1 });
  });

  it('預設不分大小寫，開啟後才分', () => {
    expect(findInPresentation(sample(), 'cloud')[0].count).toBe(2);
    expect(findInPresentation(sample(), 'cloud', { caseSensitive: true })).toEqual([]);
  });

  it('空白的搜尋字串不回傳任何結果', () => {
    expect(findInPresentation(sample(), '  ')).toEqual([]);
  });

  it('全部取代會回報次數，而且不改動原本的簡報', () => {
    const source = sample();
    const result = replaceInPresentation(source, '雲端', '公有雲');

    expect(result.replaced).toBe(3);
    expect(result.presentation.slides[0].elements[0]).toMatchObject({
      text: '公有雲服務與公有雲安全',
    });
    expect(source.slides[0].elements[0]).toMatchObject({ text: '雲端服務與雲端安全' });
  });

  it('表格的儲存格也會被取代', () => {
    const result = replaceInPresentation(sample(), '雲端', '公有雲');
    const found = result.presentation.slides[1].elements[0];

    expect(found.type === 'table' ? found.cells[0][0] : '').toBe('公有雲');
  });

  it('找不到的字串不會產生任何變更', () => {
    expect(replaceInPresentation(sample(), '不存在的字', 'x').replaced).toBe(0);
  });
});
