import type { ImageCrop } from './types';

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
