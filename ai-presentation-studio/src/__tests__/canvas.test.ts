import { describe, expect, it } from 'vitest';
import { createRectElement, createTextElement } from '../model/factory';
import {
  countSelectedOverlaps,
  findOpenPlacement,
  fitRectToCanvas,
  scaleElementWithinBounds,
} from '../components/Canvas';

describe('畫布邊界與預設位置', () => {
  it('新增元素不會超出投影片', () => {
    expect(
      fitRectToCanvas({ x: 1800, y: 1000, width: 600, height: 300 }, 1920, 1080),
    ).toEqual({ x: 1320, y: 780, width: 600, height: 300 });

    expect(
      fitRectToCanvas({ x: -80, y: -40, width: 2400, height: 1400 }, 1920, 1080),
    ).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
  });

  it('點一下新增時會避開未鎖定元素', () => {
    const blocker = createRectElement({ x: 100, y: 100, width: 500, height: 300 });
    const placed = findOpenPlacement(
      { x: 120, y: 120, width: 240, height: 120 },
      1920,
      1080,
      [blocker],
    );

    expect(placed).not.toMatchObject({ x: 120, y: 120 });
    expect(placed.x).toBeGreaterThanOrEqual(0);
    expect(placed.y).toBeGreaterThanOrEqual(0);
    expect(placed.x + placed.width).toBeLessThanOrEqual(1920);
    expect(placed.y + placed.height).toBeLessThanOrEqual(1080);
  });

  it('鎖定的背景不會阻擋預設位置', () => {
    const background = createRectElement({
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
      locked: true,
    });
    const preferred = { x: 120, y: 120, width: 240, height: 120 };

    expect(findOpenPlacement(preferred, 1920, 1080, [background])).toEqual(preferred);
  });

  it('只警告與可編輯元件的重疊', () => {
    const selected = createRectElement({ id: 'selected', x: 100, y: 100, width: 300, height: 200 });
    const overlap = createRectElement({ id: 'overlap', x: 250, y: 180, width: 300, height: 200 });
    const lockedBackground = {
      ...createRectElement({
        id: 'background',
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      }),
      locked: true,
    };

    expect(countSelectedOverlaps([selected, overlap, lockedBackground], ['selected'])).toBe(1);
    expect(countSelectedOverlaps([selected, lockedBackground], ['selected'])).toBe(0);
  });

  it('群組縮放會同步調整成員位置、大小與文字字級', () => {
    const from = { x: 100, y: 100, width: 600, height: 300 };
    const to = { x: 200, y: 200, width: 1200, height: 600 };
    const rect = createRectElement({
      x: 100,
      y: 100,
      width: 200,
      height: 100,
      radius: 12,
      strokeWidth: 2,
    });
    const text = createTextElement({
      x: 400,
      y: 250,
      width: 300,
      height: 150,
      fontSize: 40,
      letterSpacing: 1,
    });

    const scaledRect = scaleElementWithinBounds(rect, from, to);
    const scaledText = scaleElementWithinBounds(text, from, to);

    expect(scaledRect).toMatchObject({ x: 200, y: 200, width: 400, height: 200 });
    expect(scaledRect.type === 'rect' ? scaledRect.radius : 0).toBe(24);
    expect(scaledText).toMatchObject({ x: 800, y: 500, width: 600, height: 300 });
    expect(scaledText.type === 'text' ? scaledText.fontSize : 0).toBe(80);
    expect(scaledText.type === 'text' ? scaledText.letterSpacing : 0).toBe(2);
  });
});
