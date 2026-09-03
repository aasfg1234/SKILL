/**
 * 基本圖形的座標與 SVG。
 *
 * 這一層只算座標與產生字串，不依賴 React，
 * 編輯器與匯出 HTML 共用同一份，兩邊形狀才會一模一樣。
 */

export type ShapeKind = 'triangle' | 'diamond' | 'arrow' | 'star' | 'callout';

export const SHAPE_KINDS: ShapeKind[] = ['triangle', 'diamond', 'arrow', 'star', 'callout'];

export const SHAPE_LABELS: Record<ShapeKind, string> = {
  triangle: '三角形',
  diamond: '菱形',
  arrow: '箭頭',
  star: '星形',
  callout: '對話框',
};

function num(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function point(x: number, y: number): string {
  return `${num(x)},${num(y)}`;
}

function starPoints(width: number, height: number): string {
  const cx = width / 2;
  const cy = height / 2;
  const inner = 0.382;
  const points: string[] = [];
  for (let i = 0; i < 10; i += 1) {
    const angle = ((-90 + i * 36) * Math.PI) / 180;
    const scale = i % 2 === 0 ? 1 : inner;
    points.push(point(cx + Math.cos(angle) * cx * scale, cy + Math.sin(angle) * cy * scale));
  }
  return points.join(' ');
}

/** 形狀在 width × height 的框裡的多邊形座標。 */
export function shapePoints(shape: ShapeKind, width: number, height: number): string {
  switch (shape) {
    case 'triangle':
      return [point(width / 2, 0), point(width, height), point(0, height)].join(' ');
    case 'diamond':
      return [
        point(width / 2, 0),
        point(width, height / 2),
        point(width / 2, height),
        point(0, height / 2),
      ].join(' ');
    case 'arrow':
      return [
        point(0, height * 0.25),
        point(width * 0.6, height * 0.25),
        point(width * 0.6, 0),
        point(width, height / 2),
        point(width * 0.6, height),
        point(width * 0.6, height * 0.75),
        point(0, height * 0.75),
      ].join(' ');
    case 'star':
      return starPoints(width, height);
    case 'callout':
    default:
      return [
        point(0, 0),
        point(width, 0),
        point(width, height * 0.72),
        point(width * 0.38, height * 0.72),
        point(width * 0.18, height),
        point(width * 0.24, height * 0.72),
        point(0, height * 0.72),
      ].join(' ');
  }
}

export interface ShapeSvgOptions {
  shape: ShapeKind;
  width: number;
  height: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
}

export function buildShapeSvg(options: ShapeSvgOptions): string {
  const { shape, width, height, fill, stroke, strokeWidth } = options;
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const strokeAttrs =
    strokeWidth > 0
      ? ` stroke="${stroke}" stroke-width="${num(strokeWidth)}" stroke-linejoin="round"`
      : '';
  return `<svg viewBox="0 0 ${num(w)} ${num(h)}" width="100%" height="100%" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg"><polygon points="${shapePoints(shape, w, h)}" fill="${fill}"${strokeAttrs} /></svg>`;
}

export interface LineSvgOptions {
  width: number;
  height: number;
  stroke: string;
  strokeWidth: number;
  arrowStart?: boolean;
  arrowEnd?: boolean;
}

/**
 * 一條水平線，可在兩端加箭頭。
 *
 * 有箭頭的那一端，線會提早收尾，讓箭頭尖端就是線的端點，
 * 不然線會從箭頭中間穿出去。
 */
export function buildLineSvg(options: LineSvgOptions): string {
  const { stroke, arrowStart = false, arrowEnd = false } = options;
  const w = Math.max(1, options.width);
  const h = Math.max(1, options.height);
  const thickness = Math.max(1, options.strokeWidth);
  const y = h / 2;
  const head = Math.min(w / 2, Math.max(8, thickness * 4));
  const half = head * 0.6;

  const x1 = arrowStart ? head : 0;
  const x2 = arrowEnd ? w - head : w;

  const heads: string[] = [];
  if (arrowStart) {
    heads.push(
      `<polygon points="${point(0, y)} ${point(head, y - half)} ${point(head, y + half)}" fill="${stroke}" />`,
    );
  }
  if (arrowEnd) {
    heads.push(
      `<polygon points="${point(w, y)} ${point(w - head, y - half)} ${point(w - head, y + half)}" fill="${stroke}" />`,
    );
  }

  return `<svg viewBox="0 0 ${num(w)} ${num(h)}" width="100%" height="100%" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg"><line x1="${num(x1)}" y1="${num(y)}" x2="${num(x2)}" y2="${num(y)}" stroke="${stroke}" stroke-width="${num(thickness)}" stroke-linecap="round" />${heads.join('')}</svg>`;
}
