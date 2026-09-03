import type { ImageCrop } from './types';
import { normalizeCrop } from './imageCrop';

/**
 * 在畫布上拖曳裁切框。
 *
 * 這一層只算數字，不碰 DOM，所以拖曳規則可以單獨測。
 * 四個數字都是 0 到 1 的比例，對應「整張原圖」的位置與大小。
 */

export type CropHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export const CROP_HANDLES: CropHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/** 裁切框不能小於這個比例，不然會小到抓不到。 */
export const MIN_CROP = 0.05;

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 把整張原圖攤開：算出「如果整張圖都顯示，它會在哪裡、多大」。
 *
 * 這樣裁切時看到的圖跟裁切前的比例一模一樣，亮框就正好是目前的元件框。
 */
export function imageRectOf(box: CropBox, crop: ImageCrop | undefined | null): CropBox {
  const c = normalizeCrop(crop);
  const width = box.width / c.w;
  const height = box.height / c.h;
  return {
    x: box.x - c.x * width,
    y: box.y - c.y * height,
    width,
    height,
  };
}

/**
 * 完成裁切後元件要縮成的新框。
 *
 * 元件框直接變成使用者框起來的那一塊，所以畫面上看到的東西不會變形，
 * 也不會跳回原圖尺寸。這是 imageRectOf() 的反運算。
 */
export function croppedBox(image: CropBox, crop: ImageCrop | undefined | null): CropBox {
  const c = normalizeCrop(crop);
  return {
    x: Math.round(image.x + c.x * image.width),
    y: Math.round(image.y + c.y * image.height),
    width: Math.max(1, Math.round(c.w * image.width)),
    height: Math.max(1, Math.round(c.h * image.height)),
  };
}

/** 整個框一起搬，大小不變，碰到圖片邊界就停住。 */
export function moveCrop(crop: ImageCrop, dx: number, dy: number): ImageCrop {
  return {
    x: round(clamp(crop.x + dx, 0, 1 - crop.w)),
    y: round(clamp(crop.y + dy, 0, 1 - crop.h)),
    w: round(crop.w),
    h: round(crop.h),
  };
}

/** 拉前緣（左邊或上面）：位置跟著動，另一邊固定不動。 */
function dragLeading(pos: number, size: number, delta: number): [number, number] {
  const edge = pos + size;
  const next = clamp(pos + delta, 0, edge - MIN_CROP);
  return [next, edge - next];
}

/** 拉後緣（右邊或下面）：位置不動，只改大小。 */
function dragTrailing(pos: number, size: number, delta: number): [number, number] {
  return [pos, clamp(size + delta, MIN_CROP, 1 - pos)];
}

/** 拉某一個控制點；dx、dy 是佔整張原圖寬高的比例。 */
export function resizeCrop(
  crop: ImageCrop,
  handle: CropHandle,
  dx: number,
  dy = 0,
): ImageCrop {
  let { x, y, w, h } = crop;

  if (handle === 'nw' || handle === 'w' || handle === 'sw') {
    [x, w] = dragLeading(x, w, dx);
  } else if (handle === 'ne' || handle === 'e' || handle === 'se') {
    [x, w] = dragTrailing(x, w, dx);
  }

  if (handle === 'nw' || handle === 'n' || handle === 'ne') {
    [y, h] = dragLeading(y, h, dy);
  } else if (handle === 'sw' || handle === 's' || handle === 'se') {
    [y, h] = dragTrailing(y, h, dy);
  }

  return { x: round(x), y: round(y), w: round(w), h: round(h) };
}
