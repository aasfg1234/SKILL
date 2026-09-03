import type { ImageCrop, ImageFit } from './types';

/**
 * 圖片裁切：只保留原圖的一塊矩形，並讓那一塊填滿元件框。
 *
 * 四個數字都是 0 到 1 的比例，對應原圖的寬高。
 * 編輯器與匯出 HTML 共用這一份計算，兩邊才會裁在同一個位置。
 */

const FULL: ImageCrop = { x: 0, y: 0, w: 1, h: 1 };

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function normalizeCrop(crop: ImageCrop | undefined | null): ImageCrop {
  if (!crop) return { ...FULL };

  const w = clamp(crop.w, 0, 1);
  const h = clamp(crop.h, 0, 1);
  if (w <= 0 || h <= 0) return { ...FULL };

  return {
    x: clamp(crop.x, 0, 1 - w),
    y: clamp(crop.y, 0, 1 - h),
    w,
    h,
  };
}

export function isCropped(crop: ImageCrop | undefined | null): boolean {
  const c = normalizeCrop(crop);
  return c.x !== 0 || c.y !== 0 || c.w !== 1 || c.h !== 1;
}

function percent(value: number): string {
  return `${Math.round(value * 1000) / 1000}%`;
}

export interface CropImageStyle {
  position: 'absolute';
  width: string;
  height: string;
  left: string;
  top: string;
  /** 全域樣式有 img{max-width:100%}，放大時一定要解除，否則會被壓回框寬 */
  maxWidth: 'none';
  maxHeight: 'none';
  objectFit: ImageFit;
  display: 'block';
}

/**
 * 裁切後圖片本身的樣式。外框必須設 overflow:hidden。
 *
 * 有裁切時一律用 fill 拉伸：使用者已經自己框好範圍，
 * 再留白或再裁一次都會讓結果跟他框的不一樣。
 */
export function cropImageStyle(
  crop: ImageCrop | undefined | null,
  fit: ImageFit,
): CropImageStyle {
  const c = normalizeCrop(crop);
  if (!isCropped(c)) {
    return {
      position: 'absolute',
      width: '100%',
      height: '100%',
      left: '0%',
      top: '0%',
      maxWidth: 'none',
      maxHeight: 'none',
      objectFit: fit,
      display: 'block',
    };
  }

  return {
    position: 'absolute',
    width: percent(100 / c.w),
    height: percent(100 / c.h),
    left: percent((-c.x / c.w) * 100),
    top: percent((-c.y / c.h) * 100),
    maxWidth: 'none',
    maxHeight: 'none',
    objectFit: 'fill',
    display: 'block',
  };
}
