import { describe, expect, it } from 'vitest';
import { createSlide } from '../model/factory';
import { buildPresenterView, formatElapsed } from '../model/presenter';

const SLIDES = [
  createSlide({ id: 's1', title: '開場', notes: '先自我介紹。' }),
  createSlide({ id: 's2', title: '市場', notes: '' }),
  createSlide({ id: 's3', title: '結語', notes: '留三分鐘問答。' }),
];

describe('講者檢視', () => {
  it('計時器顯示分秒，超過一小時才顯示小時', () => {
    expect(formatElapsed(0)).toBe('00:00');
    expect(formatElapsed(9_000)).toBe('00:09');
    expect(formatElapsed(65_000)).toBe('01:05');
    expect(formatElapsed(600_000)).toBe('10:00');
    expect(formatElapsed(3_665_000)).toBe('1:01:05');
  });

  it('負數或壞掉的時間一律當成零', () => {
    expect(formatElapsed(-5_000)).toBe('00:00');
    expect(formatElapsed(Number.NaN)).toBe('00:00');
  });

  it('提供目前這頁與下一頁的資訊', () => {
    const view = buildPresenterView(SLIDES, 0, 0);

    expect(view.total).toBe(3);
    expect(view.current).toMatchObject({ index: 0, title: '開場', notes: '先自我介紹。' });
    expect(view.next).toMatchObject({ index: 1, title: '市場' });
  });

  it('最後一頁沒有下一頁', () => {
    expect(buildPresenterView(SLIDES, 2, 0).next).toBeNull();
  });

  it('沒寫備註時給提示文字，不是空白', () => {
    expect(buildPresenterView(SLIDES, 1, 0).current.notes).toBe('');
    expect(buildPresenterView(SLIDES, 1, 0).notesPlaceholder).toBe('這一頁沒有備註');
  });

  it('頁次超出範圍時退回第一頁，不會壞掉', () => {
    expect(buildPresenterView(SLIDES, 99, 0).current.index).toBe(0);
    expect(buildPresenterView([], 0, 0).current.title).toBe('');
  });

  it('帶上格式化後的計時', () => {
    expect(buildPresenterView(SLIDES, 0, 65_000).elapsedText).toBe('01:05');
  });
});
