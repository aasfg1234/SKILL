import { describe, expect, it } from 'vitest';
import { SHAPE_KINDS, buildLineSvg, buildShapeSvg, shapePoints } from '../model/shapes';

describe('形狀的座標', () => {
  it('三角形是上中、右下、左下三個點', () => {
    expect(shapePoints('triangle', 100, 50)).toBe('50,0 100,50 0,50');
  });

  it('菱形是上右下左四個點', () => {
    expect(shapePoints('diamond', 100, 50)).toBe('50,0 100,25 50,50 0,25');
  });

  it('箭頭的尖端在正右方的中間高度', () => {
    const points = shapePoints('arrow', 100, 50).split(' ');

    expect(points).toHaveLength(7);
    expect(points).toContain('100,25');
  });

  it('五角星有十個點', () => {
    expect(shapePoints('star', 100, 100).split(' ')).toHaveLength(10);
  });

  it('對話框有一條往下的尾巴', () => {
    const points = shapePoints('callout', 100, 100).split(' ');

    expect(points).toHaveLength(7);
    expect(points.some((p) => p.endsWith(',100'))).toBe(true);
  });

  it('五種形狀都有座標', () => {
    SHAPE_KINDS.forEach((kind) => {
      expect(shapePoints(kind, 80, 60).length).toBeGreaterThan(0);
    });
  });
});

describe('形狀的 SVG', () => {
  it('會畫出多邊形，並帶上填色與邊框', () => {
    const svg = buildShapeSvg({ shape: 'triangle', width: 100, height: 50, fill: '#123456', stroke: '#654321', strokeWidth: 3 });

    expect(svg).toContain('<polygon');
    expect(svg).toContain('#123456');
    expect(svg).toContain('#654321');
  });

  it('邊框寬度是零時不畫邊框', () => {
    const svg = buildShapeSvg({ shape: 'triangle', width: 100, height: 50, fill: '#123456', stroke: '#654321', strokeWidth: 0 });

    expect(svg).not.toContain('#654321');
  });
});

describe('線條的箭頭', () => {
  it('沒有箭頭時只有一條線', () => {
    const svg = buildLineSvg({ width: 200, height: 20, stroke: '#000000', strokeWidth: 2 });

    expect(svg).toContain('<line');
    expect(svg).not.toContain('<polygon');
  });

  it('右端有箭頭時會多一個三角形', () => {
    const svg = buildLineSvg({ width: 200, height: 20, stroke: '#000000', strokeWidth: 2, arrowEnd: true });

    expect(svg).toContain('<polygon');
  });

  it('兩端都有箭頭時會有兩個三角形', () => {
    const svg = buildLineSvg({ width: 200, height: 20, stroke: '#000000', strokeWidth: 2, arrowStart: true, arrowEnd: true });

    expect(svg.match(/<polygon/g)).toHaveLength(2);
  });

  it('箭頭會佔用線的長度，線不會穿出箭頭尖端', () => {
    const plain = buildLineSvg({ width: 200, height: 20, stroke: '#000000', strokeWidth: 2 });
    const arrowed = buildLineSvg({ width: 200, height: 20, stroke: '#000000', strokeWidth: 2, arrowEnd: true });

    expect(plain).toContain('x2="200"');
    expect(arrowed).not.toContain('x2="200"');
  });
});
