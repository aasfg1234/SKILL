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
        notes: '記得提到雲端成本。',
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
    const elementHits = findInPresentation(sample(), '雲端').filter(
      (hit) => hit.field === 'element',
    );

    expect(elementHits.map((hit) => hit.elementId)).toEqual(['a', 'c']);
    expect(elementHits[0]).toMatchObject({ slideId: 'slide-01', slideIndex: 0, count: 2 });
    expect(elementHits[1]).toMatchObject({ slideId: 'slide-02', slideIndex: 1, count: 1 });
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

    // 2 次在文字元素、1 次在表格、1 次在備註
    expect(result.replaced).toBe(4);
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

  it('也會找投影片的標題與備註', () => {
    const hits = findInPresentation(sample(), '雲端');
    const notesHit = hits.find((hit) => hit.field === 'notes');

    expect(notesHit).toMatchObject({ slideId: 'slide-01', elementId: null, count: 1 });
    expect(hits.filter((hit) => hit.field === 'element').map((hit) => hit.elementId)).toEqual([
      'a',
      'c',
    ]);
  });

  it('找得到只出現在標題裡的字', () => {
    const hits = findInPresentation(sample(), '第二頁');

    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ field: 'title', slideId: 'slide-02', elementId: null });
  });

  it('取代也會改到標題與備註', () => {
    const result = replaceInPresentation(sample(), '雲端', '公有雲');

    expect(result.presentation.slides[0].notes).toBe('記得提到公有雲成本。');
    expect(result.replaced).toBe(4);
  });
});
