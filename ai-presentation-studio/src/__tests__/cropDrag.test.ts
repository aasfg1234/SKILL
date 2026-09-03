import { describe, expect, it } from 'vitest';
import { CROP_HANDLES, MIN_CROP, moveCrop, resizeCrop } from '../model/cropDrag';

const HALF = { x: 0.2, y: 0.2, w: 0.5, h: 0.5 };

describe('搬動裁切框', () => {
  it('搬動之後大小不變', () => {
    expect(moveCrop(HALF, 0.1, 0.1)).toEqual({ x: 0.3, y: 0.3, w: 0.5, h: 0.5 });
  });

  it('往右搬過頭會停在右邊界', () => {
    expect(moveCrop(HALF, 0.9, 0).x).toBe(0.5);
  });

  it('往左搬過頭會停在左邊界', () => {
    expect(moveCrop(HALF, -0.9, 0).x).toBe(0);
  });

  it('上下也一樣會被擋住', () => {
    expect(moveCrop(HALF, 0, 0.9).y).toBe(0.5);
    expect(moveCrop(HALF, 0, -0.9).y).toBe(0);
  });
});

describe('拉動裁切框的邊', () => {
  it('拉右邊只會改變寬度', () => {
    const next = resizeCrop({ x: 0, y: 0, w: 0.5, h: 1 }, 'e', 0.2, 0);

    expect(next).toEqual({ x: 0, y: 0, w: 0.7, h: 1 });
  });

  it('右邊拉過頭會停在圖片邊界', () => {
    expect(resizeCrop({ x: 0, y: 0, w: 0.5, h: 1 }, 'e', 0.8).w).toBe(1);
  });

  it('拉左邊會同時改變位置與寬度', () => {
    const next = resizeCrop({ x: 0.2, y: 0, w: 0.5, h: 1 }, 'w', -0.1);

    expect(next).toEqual({ x: 0.1, y: 0, w: 0.6, h: 1 });
  });

  it('拉左上角會四個數字一起改', () => {
    const next = resizeCrop({ x: 0.2, y: 0.2, w: 0.5, h: 0.5 }, 'nw', 0.1, 0.1);

    expect(next).toEqual({ x: 0.3, y: 0.3, w: 0.4, h: 0.4 });
  });

  it('拉到比最小尺寸還小時會停住', () => {
    expect(resizeCrop({ x: 0, y: 0, w: 0.5, h: 0.5 }, 'e', -0.9).w).toBe(MIN_CROP);
  });

  it('左邊往右拉過頭時，右邊界不會被推動', () => {
    const next = resizeCrop({ x: 0, y: 0, w: 0.5, h: 0.5 }, 'w', 0.9);

    expect(next.w).toBe(MIN_CROP);
    expect(Math.round((next.x + next.w) * 100)).toBe(50);
  });

  it('拉下邊只會改變高度', () => {
    const next = resizeCrop({ x: 0, y: 0, w: 1, h: 0.5 }, 's', 0, 0.2);

    expect(next).toEqual({ x: 0, y: 0, w: 1, h: 0.7 });
  });

  it('八個控制點都認得', () => {
    expect(CROP_HANDLES).toHaveLength(8);
    CROP_HANDLES.forEach((handle) => {
      expect(resizeCrop(HALF, handle, 0.05, 0.05).w).toBeGreaterThan(0);
    });
  });
});
