import { describe, expect, it } from 'vitest';
import {
  createAiComponentElement,
  createSlide,
  createTextElement,
} from '../model/factory';
import { PRESET_SIZES, aspectRatioLabel, elementsForPresenting } from '../model/presenting';

const SLIDE = createSlide({
  elements: [
    createTextElement({ id: 'title', text: '標題', z: 1 }),
    createAiComponentElement({ id: 'waiting', taskId: 'TASK-001', status: 'pending', z: 2 }),
    createAiComponentElement({
      id: 'done',
      taskId: 'TASK-002',
      status: 'completed',
      result: { type: 'text', content: '完成的內容' },
      z: 3,
    }),
    createAiComponentElement({ id: 'failed', taskId: 'TASK-003', status: 'error', z: 4 }),
  ],
});

describe('播放時隱藏未完成的 AI 元件', () => {
  it('關閉時全部照常顯示', () => {
    expect(elementsForPresenting(SLIDE.elements, false).map((el) => el.id)).toEqual([
      'title',
      'waiting',
      'done',
      'failed',
    ]);
  });

  it('開啟時只藏掉還沒完成的 AI 元件，其他元素不動', () => {
    expect(elementsForPresenting(SLIDE.elements, true).map((el) => el.id)).toEqual([
      'title',
      'done',
    ]);
  });

  it('沒有 AI 元件的投影片不受影響', () => {
    const plain = [createTextElement({ id: 'only', text: 'x', z: 1 })];

    expect(elementsForPresenting(plain, true)).toEqual(plain);
  });
});

describe('投影片尺寸預設', () => {
  it('提供 16:9 與 4:3 兩種，高度一致', () => {
    expect(PRESET_SIZES.map((p) => p.id)).toEqual(['16:9', '4:3']);
    expect(PRESET_SIZES[0]).toMatchObject({ width: 1920, height: 1080 });
    expect(PRESET_SIZES[1]).toMatchObject({ width: 1440, height: 1080 });
  });

  it('看得出目前是哪一種比例', () => {
    expect(aspectRatioLabel(1920, 1080)).toBe('16:9');
    expect(aspectRatioLabel(1440, 1080)).toBe('4:3');
    expect(aspectRatioLabel(3840, 2160)).toBe('16:9');
    expect(aspectRatioLabel(1000, 777)).toBe('自訂');
  });
});
