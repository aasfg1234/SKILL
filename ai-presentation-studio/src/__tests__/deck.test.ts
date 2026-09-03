import { describe, expect, it } from 'vitest';
import { createPresentation, createSlide } from '../model/factory';
import { slideNumberFor, visibleSlides } from '../model/deck';

function deckOf(hiddenIndexes: number[] = []) {
  const p = createPresentation({
    slides: [
      createSlide({ id: 's1', masterKind: 'cover' }),
      createSlide({ id: 's2', masterKind: 'content' }),
      createSlide({ id: 's3', masterKind: 'content' }),
    ],
  });
  hiddenIndexes.forEach((i) => {
    p.slides[i].hidden = true;
  });
  p.settings.showSlideNumbers = true;
  return p;
}

describe('隱藏投影片', () => {
  it('隱藏的投影片不會出現在播放清單', () => {
    const p = deckOf([1]);

    expect(visibleSlides(p).map((s) => s.id)).toEqual(['s1', 's3']);
  });

  it('沒有隱藏欄位的舊簡報全部都要播', () => {
    const p = createPresentation({ slides: [createSlide({ id: 'a' }), createSlide({ id: 'b' })] });

    expect(visibleSlides(p)).toHaveLength(2);
  });
});

describe('自動頁碼', () => {
  it('頁碼只算沒有被隱藏的投影片', () => {
    const p = deckOf([1]);

    expect(slideNumberFor(p, 2)?.text).toBe('2');
  });

  it('被隱藏的投影片沒有頁碼', () => {
    const p = deckOf([1]);

    expect(slideNumberFor(p, 1)).toBeNull();
  });

  it('關掉頁碼時每一頁都沒有頁碼', () => {
    const p = deckOf();
    p.settings.showSlideNumbers = false;

    expect(slideNumberFor(p, 1)).toBeNull();
  });

  it('舊簡報沒有這個設定時預設不顯示頁碼', () => {
    const p = createPresentation({ slides: [createSlide({ id: 'a' })] });
    delete p.settings.showSlideNumbers;

    expect(slideNumberFor(p, 0)).toBeNull();
  });

  it('封面可以單獨不顯示頁碼，但不會讓後面的頁碼往前移', () => {
    const p = deckOf();
    p.settings.hideNumberOnCover = true;

    expect(slideNumberFor(p, 0)).toBeNull();
    expect(slideNumberFor(p, 1)?.text).toBe('2');
  });

  it('頁碼會靠右下角，並使用主題的次要文字顏色', () => {
    const p = deckOf();
    const box = slideNumberFor(p, 1);

    expect(box?.right).toBeGreaterThan(0);
    expect(box?.bottom).toBeGreaterThan(0);
    expect(box?.color).toBe(p.theme.palette.muted);
  });
});
