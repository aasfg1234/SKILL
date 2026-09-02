/**
 * 講者檢視的資料組裝。
 *
 * 只負責算出「這一頁的備註、下一頁是什麼、講了多久」，
 * 不碰畫面，也不碰 store，所以編輯器與匯出的 HTML 可以共用同一套規則。
 */

export const NOTES_PLACEHOLDER = '這一頁沒有備註';

export interface PresenterSlideInfo {
  index: number;
  title: string;
  notes: string;
}

export interface PresenterView {
  total: number;
  current: PresenterSlideInfo;
  next: PresenterSlideInfo | null;
  /** 已格式化的經過時間 */
  elapsedText: string;
  /** 沒有備註時要顯示的提示 */
  notesPlaceholder: string;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** 把毫秒轉成 mm:ss；超過一小時才顯示 h:mm:ss。壞掉的值一律當成零。 */
export function formatElapsed(ms: number): string {
  const safe = Number.isFinite(ms) && ms > 0 ? ms : 0;
  const seconds = Math.floor(safe / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${pad(minutes)}:${pad(rest)}`;
}

/**
 * 播放時的換頁按鍵。
 *
 * 回傳 1 代表下一頁，-1 代表上一頁，0 代表這個鍵不換頁。
 * 編輯器與匯出的 HTML 共用同一份對照，行為才會一致。
 */
export function previewStepFromKey(key: string): number {
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
    case 'PageDown':
    case ' ':
    case 'Spacebar':
    case 'Enter':
      return 1;
    case 'ArrowLeft':
    case 'ArrowUp':
    case 'PageUp':
    case 'Backspace':
      return -1;
    default:
      return 0;
  }
}

interface SlideLike {
  title: string;
  notes: string;
}

/** 組出講者檢視要顯示的內容。頁次超出範圍時退回第一頁。 */
export function buildPresenterView(
  slides: SlideLike[],
  index: number,
  elapsedMs: number,
): PresenterView {
  const total = slides.length;
  const safeIndex = index >= 0 && index < total ? index : 0;
  const currentSlide = slides[safeIndex];
  const nextSlide = slides[safeIndex + 1];

  return {
    total,
    current: {
      index: safeIndex,
      title: currentSlide?.title ?? '',
      notes: currentSlide?.notes ?? '',
    },
    next: nextSlide
      ? { index: safeIndex + 1, title: nextSlide.title, notes: nextSlide.notes }
      : null,
    elapsedText: formatElapsed(elapsedMs),
    notesPlaceholder: NOTES_PLACEHOLDER,
  };
}
