import { describe, expect, it } from 'vitest';
import { croppedBox, imageRectOf } from '../model/cropDrag';

const BOX = { x: 100, y: 50, width: 200, height: 100 };

describe('攤開整張原圖', () => {
  it('沒有裁切過時，原圖的位置就是元件框', () => {
    expect(imageRectOf(BOX, { x: 0, y: 0, w: 1, h: 1 })).toEqual(BOX);
  });

  it('只留中間一半時，攤開後寬度變兩倍並往左延伸', () => {
    expect(imageRectOf(BOX, { x: 0.25, y: 0, w: 0.5, h: 1 })).toEqual({
      x: 0,
      y: 50,
      width: 400,
      height: 100,
    });
  });

  it('上下也一樣會往上延伸', () => {
    expect(imageRectOf(BOX, { x: 0, y: 0.5, w: 1, h: 0.5 })).toEqual({
      x: 100,
      y: -50,
      width: 200,
      height: 200,
    });
  });

  it('沒有裁切欄位的舊資料當成整張', () => {
    expect(imageRectOf(BOX, undefined)).toEqual(BOX);
  });
});

describe('完成裁切後的新框', () => {
  it('新框就是框起來的那一塊，不會回到原圖尺寸', () => {
    const image = { x: 0, y: 0, width: 400, height: 200 };

    expect(croppedBox(image, { x: 0.5, y: 0, w: 0.5, h: 1 })).toEqual({
      x: 200,
      y: 0,
      width: 200,
      height: 200,
    });
  });

  it('框跟攤開互為反運算，來回一次會回到原本的框', () => {
    const crop = { x: 0.2, y: 0.3, w: 0.5, h: 0.4 };

    expect(croppedBox(imageRectOf(BOX, crop), crop)).toEqual(BOX);
  });

  it('寬高會取整數，而且至少 1', () => {
    const image = { x: 0, y: 0, width: 10, height: 10 };
    const tiny = croppedBox(image, { x: 0, y: 0, w: 0.05, h: 0.05 });

    expect(tiny.width).toBeGreaterThanOrEqual(1);
    expect(Number.isInteger(tiny.width)).toBe(true);
  });
});
