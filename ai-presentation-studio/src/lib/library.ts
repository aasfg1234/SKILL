import type { Presentation } from '../model/types';

/**
 * 簡報清單。
 *
 * 原本瀏覽器裡只存得下一份簡報，做第二份就會蓋掉第一份。
 * 這裡把多份簡報一起存在同一個鍵底下，用 `metadata.id` 當識別。
 *
 * 刻意不引入 IndexedDB：localStorage 已經夠用，也維持「單機、無依賴」的設計。
 *
 * 容量上限依瀏覽器而定。在 Chromium 實測約為 49 MB（寫得下 49 MB，50 MB 失敗）。
 * 舊資料常說的「5～10 MB」是較早期的值，新版 Chromium 已經放寬。
 * 不論上限多少都可能被塞滿（內嵌圖片很吃空間），
 * 因此 `upsertDeck` 會回報成功或失敗，由呼叫端提示使用者。
 */

export const LIBRARY_KEY = 'ai-presentation-studio/library/v1';

/** 只需要 localStorage 的這三個方法，測試才好替換。 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface DeckSummary {
  id: string;
  title: string;
  slideCount: number;
  /** ISO 時間字串，最後一次存檔的時間 */
  updatedAt: string;
}

interface LibraryFile {
  decks: Array<DeckSummary & { presentation: Presentation }>;
}

function read(storage: StorageLike): LibraryFile {
  try {
    const raw = storage.getItem(LIBRARY_KEY);
    if (!raw) return { decks: [] };
    const parsed = JSON.parse(raw) as LibraryFile;
    return Array.isArray(parsed?.decks) ? parsed : { decks: [] };
  } catch {
    return { decks: [] };
  }
}

function write(storage: StorageLike, file: LibraryFile): boolean {
  try {
    storage.setItem(LIBRARY_KEY, JSON.stringify(file));
    return true;
  } catch {
    return false;
  }
}

/** 目前存了哪些簡報；最近存過的排在最前面。 */
export function listDecks(storage: StorageLike): DeckSummary[] {
  return read(storage).decks.map(({ presentation: _presentation, ...summary }) => summary);
}

/** 存入或更新一份簡報。回傳是否成功（空間不足時為 false）。 */
export function upsertDeck(storage: StorageLike, presentation: Presentation): boolean {
  const file = read(storage);
  const id = presentation.metadata.id;
  const entry = {
    id,
    title: presentation.metadata.title || '未命名簡報',
    slideCount: presentation.slides.length,
    updatedAt: new Date().toISOString(),
    presentation,
  };
  const rest = file.decks.filter((deck) => deck.id !== id);
  return write(storage, { decks: [entry, ...rest] });
}

/** 讀回一份完整的簡報；找不到回傳 null。 */
export function loadDeck(storage: StorageLike, id: string): Presentation | null {
  return read(storage).decks.find((deck) => deck.id === id)?.presentation ?? null;
}

/** 目前簡報清單佔用多少位元組，用來提示使用者還剩多少空間。 */
export function libraryUsageBytes(storage: StorageLike): number {
  const raw = storage.getItem(LIBRARY_KEY);
  return raw ? raw.length : 0;
}

/** 刪除一份簡報。 */
export function deleteDeck(storage: StorageLike, id: string): boolean {
  const file = read(storage);
  return write(storage, { decks: file.decks.filter((deck) => deck.id !== id) });
}
