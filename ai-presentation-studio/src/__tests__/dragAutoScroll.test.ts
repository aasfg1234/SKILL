import { describe, expect, it } from 'vitest';
import { dragAutoScrollSpeed } from '../lib/dragAutoScroll';

describe('投影片拖曳自動捲動', () => {
  it('滑鼠在中間時不捲動', () => {
    expect(dragAutoScrollSpeed(300, 100, 500)).toBe(0);
  });

  it('靠近上緣時往上捲，愈靠外愈快', () => {
    expect(dragAutoScrollSpeed(150, 100, 500)).toBeLessThan(0);
    expect(dragAutoScrollSpeed(90, 100, 500)).toBe(-20);
  });

  it('靠近下緣時往下捲，超出範圍仍維持最快速度', () => {
    expect(dragAutoScrollSpeed(450, 100, 500)).toBeGreaterThan(0);
    expect(dragAutoScrollSpeed(540, 100, 500)).toBe(20);
  });

  it('壞掉的範圍或設定不會捲動', () => {
    expect(dragAutoScrollSpeed(120, 500, 100)).toBe(0);
    expect(dragAutoScrollSpeed(120, 100, 500, 0)).toBe(0);
    expect(dragAutoScrollSpeed(120, 100, 500, 72, 0)).toBe(0);
  });
});
