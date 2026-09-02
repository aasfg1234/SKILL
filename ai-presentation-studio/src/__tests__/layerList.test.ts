import { describe, expect, it } from 'vitest';
import {
  createAiComponentElement,
  createImageElement,
  createRectElement,
  createSlide,
  createTableElement,
  createTextElement,
} from '../model/factory';
import { buildLayerList } from '../model/layerList';

describe('圖層清單', () => {
  it('由上而下排列，最上層的元素排在第一個', () => {
    const slide = createSlide({
      elements: [
        createRectElement({ id: 'bottom', z: 1 }),
        createTextElement({ id: 'top', text: '標題', z: 9 }),
        createRectElement({ id: 'middle', z: 5 }),
      ],
    });

    expect(buildLayerList(slide).map((item) => item.id)).toEqual(['top', 'middle', 'bottom']);
  });

  it('文字用內容當名稱，太長會截斷', () => {
    const slide = createSlide({
      elements: [createTextElement({ id: 't', text: '一二三四五六七八九十十一十二十三', z: 1 })],
    });

    expect(buildLayerList(slide)[0].label).toBe('一二三四五六七八九十十一…');
  });

  it('沒有內容的文字顯示型別名稱', () => {
    const slide = createSlide({ elements: [createTextElement({ id: 't', text: '   ', z: 1 })] });

    expect(buildLayerList(slide)[0].label).toBe('文字');
  });

  it('表格顯示列數與欄數', () => {
    const slide = createSlide({
      elements: [createTableElement({ id: 'tb', rows: 2, columns: 4, z: 1 })],
    });

    expect(buildLayerList(slide)[0].label).toBe('表格 2×4');
  });

  it('圖片顯示替代文字，AI 元件顯示任務編號', () => {
    const slide = createSlide({
      elements: [
        createImageElement({ id: 'img', alt: '產品照', z: 1 }),
        createAiComponentElement({ id: 'ai', taskId: 'TASK-007', kind: 'chart', z: 2 }),
      ],
    });
    const list = buildLayerList(slide);

    expect(list.find((i) => i.id === 'img')?.label).toBe('產品照');
    expect(list.find((i) => i.id === 'ai')?.label).toBe('AI 圖表　TASK-007');
  });

  it('使用者自己命名時優先用那個名稱', () => {
    const slide = createSlide({
      elements: [createTextElement({ id: 't', text: '內容', name: '我的標題', z: 1 })],
    });

    expect(buildLayerList(slide)[0].label).toBe('我的標題');
  });

  it('帶出鎖定與隱藏狀態，供清單顯示按鈕', () => {
    const slide = createSlide({
      elements: [createRectElement({ id: 'r', locked: true, hidden: true, z: 1 })],
    });

    expect(buildLayerList(slide)[0]).toMatchObject({ locked: true, hidden: true, type: 'rect' });
  });
});
