import type { SlideElement } from './types';

/**
 * 播放與尺寸相關的共用規則。
 *
 * 編輯器與匯出的 HTML 都用這裡的判斷，行為才會一致。
 */

/**
 * 播放時要顯示哪些元素。
 *
 * 開啟「隱藏未完成的 AI 元件」之後，還沒交回結果的 AI 元件不會出現，
 * 觀眾就不會看到「等待 AI 處理」與內部的任務編號。
 * 只藏 AI 元件，其他元素一律照常顯示。
 */
export function elementsForPresenting(
  elements: SlideElement[],
  hideIncompleteAi: boolean,
): SlideElement[] {
  if (!hideIncompleteAi) return elements;
  return elements.filter((el) => el.type !== 'ai_component' || el.status === 'completed');
}

export interface PresetSize {
  id: string;
  label: string;
  width: number;
  height: number;
}

/** 兩種常見比例；高度一致，切換時版面落差比較小。 */
export const PRESET_SIZES: PresetSize[] = [
  { id: '16:9', label: '寬螢幕 16:9', width: 1920, height: 1080 },
  { id: '4:3', label: '傳統 4:3', width: 1440, height: 1080 },
];

/** 由寬高判斷目前是哪一種比例；對不上就是「自訂」。 */
export function aspectRatioLabel(width: number, height: number): string {
  if (height <= 0) return '自訂';
  const ratio = width / height;
  if (Math.abs(ratio - 16 / 9) < 0.01) return '16:9';
  if (Math.abs(ratio - 4 / 3) < 0.01) return '4:3';
  return '自訂';
}
