import { describe, expect, it } from 'vitest';
import { cropImageStyle, normalizeCrop } from '../model/imageCrop';

describe('圖片裁切的數值檢查', () => {
  it('沒有設定裁切時回傳整張圖', () => {
    expect(normalizeCrop(undefined)).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });

  it('寬或高是零時當成沒有裁切', () => {
    expect(normalizeCrop({ x: 0.2, y: 0, w: 0, h: 1 })).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });

  it('超出範圍的數值會被夾回 0 到 1', () => {
    expect(normalizeCrop({ x: -0.5, y: 0.9, w: 2, h: 0.5 })).toEqual({
      x: 0,
      y: 0.5,
      w: 1,
      h: 0.5,
    });
  });
});

describe('裁切後的圖片樣式', () => {
  it('沒有裁切時圖片填滿整個框', () => {
    expect(cropImageStyle(undefined, 'cover')).toMatchObject({
      width: '100%',
      height: '100%',
      left: '0%',
      top: '0%',
      objectFit: 'cover',
    });
  });

  it('只留右半邊時，圖片放大兩倍並往左移一個框寬', () => {
    const style = cropImageStyle({ x: 0.5, y: 0, w: 0.5, h: 1 }, 'cover');

    expect(style.width).toBe('200%');
    expect(style.left).toBe('-100%');
  });

  it('裁切中間時，位移只有半個框寬', () => {
    const style = cropImageStyle({ x: 0.25, y: 0, w: 0.5, h: 1 }, 'cover');

    expect(style.left).toBe('-50%');
  });

  it('裁切時要解除寬高上限，不然會被全域的 max-width:100% 壓回去', () => {
    const style = cropImageStyle({ x: 0.5, y: 0, w: 0.5, h: 1 }, 'cover');

    expect(style.maxWidth).toBe('none');
    expect(style.maxHeight).toBe('none');
  });

  it('裁切時圖片一律拉伸填滿，不再另外留白', () => {
    const style = cropImageStyle({ x: 0, y: 0.25, w: 1, h: 0.5 }, 'contain');

    expect(style.height).toBe('200%');
    expect(style.top).toBe('-50%');
    expect(style.objectFit).toBe('fill');
  });
});
