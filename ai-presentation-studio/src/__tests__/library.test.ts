import { beforeEach, describe, expect, it } from 'vitest';
import { createPresentation, createSlide } from '../model/factory';
import {
  LIBRARY_KEY,
  deleteDeck,
  listDecks,
  loadDeck,
  upsertDeck,
} from '../lib/library';

/** 假的 localStorage，讓測試不依賴瀏覽器。 */
function fakeStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
    removeItem: (k: string) => {
      delete data[k];
    },
    raw: data,
  };
}

function deck(title: string) {
  const p = createPresentation({ slides: [createSlide({ title: '第一頁' })] });
  p.metadata.title = title;
  return p;
}

describe('簡報清單', () => {
  let storage: ReturnType<typeof fakeStorage>;

  beforeEach(() => {
    storage = fakeStorage();
  });

  it('一開始是空的', () => {
    expect(listDecks(storage)).toEqual([]);
  });

  it('存進去之後列得出來，帶標題、頁數與時間', () => {
    const p = deck('第一份');
    upsertDeck(storage, p);

    const list = listDecks(storage);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: p.metadata.id, title: '第一份', slideCount: 1 });
    expect(typeof list[0].updatedAt).toBe('string');
  });

  it('同一份簡報重複存只會有一筆，內容以最後一次為準', () => {
    const p = deck('原本的標題');
    upsertDeck(storage, p);
    p.metadata.title = '改過的標題';
    upsertDeck(storage, p);

    const list = listDecks(storage);
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe('改過的標題');
  });

  it('最近存過的排在最前面', () => {
    const a = deck('A');
    const b = deck('B');
    upsertDeck(storage, a);
    upsertDeck(storage, b);
    upsertDeck(storage, a);

    expect(listDecks(storage).map((d) => d.title)).toEqual(['A', 'B']);
  });

  it('可以讀回完整的簡報', () => {
    const p = deck('讀回來');
    upsertDeck(storage, p);

    expect(loadDeck(storage, p.metadata.id)?.metadata.title).toBe('讀回來');
    expect(loadDeck(storage, 'not-exists')).toBeNull();
  });

  it('可以刪除', () => {
    const p = deck('要刪的');
    upsertDeck(storage, p);
    deleteDeck(storage, p.metadata.id);

    expect(listDecks(storage)).toEqual([]);
  });

  it('資料壞掉時回傳空清單，不會讓程式當掉', () => {
    const broken = fakeStorage({ [LIBRARY_KEY]: '{ 不是 JSON' });

    expect(listDecks(broken)).toEqual([]);
  });

  it('空間不足時回報失敗，不會丟出例外', () => {
    const full = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {},
    };

    expect(upsertDeck(full, deck('存不下'))).toBe(false);
  });
});
