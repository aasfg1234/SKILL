import { escapeHtml } from './sanitize';
import type { ChartElement } from './types';

/**
 * 圖表 → SVG 字串。
 *
 * 刻意產生「字串」而不是 React 元件，這樣編輯器與 HTML Renderer 可以共用同一份，
 * 畫出來的東西保證一模一樣，也讓 Renderer 維持不依賴 React。
 *
 * 這一版只支援單一數列（一組標籤配一組數值）。
 */

export interface ChartTypeInfo {
  id: ChartElement['chartType'];
  label: string;
  hint: string;
}

export const CHART_TYPES: ChartTypeInfo[] = [
  { id: 'bar', label: '長條圖', hint: '比較各項目的多寡' },
  { id: 'line', label: '折線圖', hint: '看趨勢隨時間的變化' },
  { id: 'pie', label: '圓餅圖', hint: '看各項目佔整體的比例' },
];

export const DEFAULT_CHART_COLORS = [
  '#4F46E5',
  '#0EA5E9',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#EC4899',
  '#14B8A6',
];

/**
 * 座標軸上限取一個好看的整數。
 *
 * 單位至少是 10，這樣刻度不會出現 7、13 這種不好讀的數字。
 */
export function niceAxisMax(max: number): number {
  if (!Number.isFinite(max) || max <= 0) return 1;
  const unit = Math.max(10, Math.pow(10, Math.floor(Math.log10(max))));
  return Math.ceil(max / unit) * unit;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** 讓標籤與數值長度一致：不足補零，多的忽略。 */
function alignSeries(el: ChartElement): { labels: string[]; values: number[] } {
  const labels = el.labels.map((label) => String(label ?? ''));
  const values = labels.map((_, i) => {
    const raw = el.values[i];
    return Number.isFinite(raw) ? Number(raw) : 0;
  });
  return { labels, values };
}

function colorAt(el: ChartElement, index: number): string {
  const palette = el.colors.length > 0 ? el.colors : DEFAULT_CHART_COLORS;
  return palette[index % palette.length];
}

function emptyChart(el: ChartElement): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${el.width} ${el.height}" width="100%" height="100%">`,
    `<text x="${el.width / 2}" y="${el.height / 2}" text-anchor="middle" dominant-baseline="middle"`,
    ` font-size="${el.fontSize * 1.2}" fill="${escapeHtml(el.color)}" opacity="0.5">尚未輸入資料</text>`,
    '</svg>',
  ].join('');
}

interface Layout {
  left: number;
  right: number;
  top: number;
  bottom: number;
  plotWidth: number;
  plotHeight: number;
}

function layoutOf(el: ChartElement, hasTitle: boolean): Layout {
  const left = 72;
  const right = 24;
  const top = hasTitle ? el.fontSize * 2.4 + 16 : 24;
  const bottom = el.fontSize * 2.2 + 16;
  return {
    left,
    right,
    top,
    bottom,
    plotWidth: Math.max(1, el.width - left - right),
    plotHeight: Math.max(1, el.height - top - bottom),
  };
}

function titleSvg(el: ChartElement): string {
  if (!el.title.trim()) return '';
  return `<text x="${el.width / 2}" y="${el.fontSize * 1.5}" text-anchor="middle" font-size="${
    el.fontSize * 1.25
  }" font-weight="700" fill="${escapeHtml(el.color)}">${escapeHtml(el.title)}</text>`;
}

function axisSvg(el: ChartElement, box: Layout, max: number): string {
  const lines: string[] = [];
  const steps = 4;
  for (let i = 0; i <= steps; i += 1) {
    const value = (max / steps) * i;
    const y = round(box.top + box.plotHeight - (box.plotHeight / steps) * i);
    lines.push(
      `<line x1="${box.left}" y1="${y}" x2="${round(box.left + box.plotWidth)}" y2="${y}" stroke="${escapeHtml(
        el.gridColor,
      )}" stroke-width="1" />`,
    );
    lines.push(
      `<text x="${box.left - 10}" y="${y + el.fontSize * 0.35}" text-anchor="end" font-size="${
        el.fontSize * 0.85
      }" fill="${escapeHtml(el.color)}" opacity="0.65">${escapeHtml(String(round(value)))}</text>`,
    );
  }
  return lines.join('');
}

function categoryLabelsSvg(el: ChartElement, box: Layout, labels: string[]): string {
  const slot = box.plotWidth / labels.length;
  return labels
    .map((label, i) => {
      const x = round(box.left + slot * i + slot / 2);
      const y = round(box.top + box.plotHeight + el.fontSize * 1.5);
      return `<text x="${x}" y="${y}" text-anchor="middle" font-size="${
        el.fontSize
      }" fill="${escapeHtml(el.color)}">${escapeHtml(label)}</text>`;
    })
    .join('');
}

function valueLabelSvg(el: ChartElement, x: number, y: number, value: number): string {
  if (!el.showValues) return '';
  return `<text x="${round(x)}" y="${round(y)}" text-anchor="middle" font-size="${
    el.fontSize * 0.9
  }" fill="${escapeHtml(el.color)}">${escapeHtml(String(round(value)))}</text>`;
}

function barChart(el: ChartElement, labels: string[], values: number[]): string {
  const box = layoutOf(el, Boolean(el.title.trim()));
  const max = niceAxisMax(Math.max(...values, 0));
  const slot = box.plotWidth / labels.length;
  const barWidth = Math.max(4, slot * 0.55);

  const bars = values
    .map((value, i) => {
      const height = round((Math.max(0, value) / max) * box.plotHeight);
      const x = round(box.left + slot * i + (slot - barWidth) / 2);
      const y = round(box.top + box.plotHeight - height);
      return (
        `<rect x="${x}" y="${y}" width="${round(barWidth)}" height="${height}" rx="4" fill="${escapeHtml(
          colorAt(el, i),
        )}" />` + valueLabelSvg(el, x + barWidth / 2, y - el.fontSize * 0.4, value)
      );
    })
    .join('');

  return axisSvg(el, box, max) + bars + categoryLabelsSvg(el, box, labels);
}

function lineChart(el: ChartElement, labels: string[], values: number[]): string {
  const box = layoutOf(el, Boolean(el.title.trim()));
  const max = niceAxisMax(Math.max(...values, 0));
  const slot = box.plotWidth / labels.length;
  const pointAt = (i: number, value: number) => ({
    x: round(box.left + slot * i + slot / 2),
    y: round(box.top + box.plotHeight - (Math.max(0, value) / max) * box.plotHeight),
  });

  const points = values.map((value, i) => pointAt(i, value));
  const stroke = colorAt(el, 0);
  const polyline = `<polyline fill="none" stroke="${escapeHtml(stroke)}" stroke-width="3" stroke-linejoin="round" points="${points
    .map((p) => `${p.x},${p.y}`)
    .join(' ')}" />`;
  const dots = points
    .map(
      (p, i) =>
        `<circle cx="${p.x}" cy="${p.y}" r="5" fill="${escapeHtml(stroke)}" />` +
        valueLabelSvg(el, p.x, p.y - el.fontSize * 0.8, values[i]),
    )
    .join('');

  return axisSvg(el, box, max) + polyline + dots + categoryLabelsSvg(el, box, labels);
}

function pieChart(el: ChartElement, labels: string[], values: number[]): string {
  const box = layoutOf(el, Boolean(el.title.trim()));
  const cx = round(box.left + box.plotWidth / 2);
  const cy = round(box.top + box.plotHeight / 2);
  const radius = round(Math.min(box.plotWidth, box.plotHeight) / 2 - 8);
  const positives = values.map((v) => Math.max(0, v));
  const total = positives.reduce((sum, v) => sum + v, 0);
  const share = (v: number) => (total > 0 ? v / total : 1 / Math.max(1, values.length));

  let angle = -Math.PI / 2;
  const slices = positives
    .map((value, i) => {
      const sweep = share(value) * Math.PI * 2;
      const end = angle + sweep;
      const x1 = round(cx + radius * Math.cos(angle));
      const y1 = round(cy + radius * Math.sin(angle));
      const x2 = round(cx + radius * Math.cos(end));
      const y2 = round(cy + radius * Math.sin(end));
      const large = sweep > Math.PI ? 1 : 0;
      const mid = angle + sweep / 2;
      angle = end;
      const labelX = round(cx + radius * 0.65 * Math.cos(mid));
      const labelY = round(cy + radius * 0.65 * Math.sin(mid));
      const percent = Math.round(share(value) * 100);
      return (
        `<path d="M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2} Z" fill="${escapeHtml(
          colorAt(el, i),
        )}" />` +
        `<text x="${labelX}" y="${labelY}" text-anchor="middle" dominant-baseline="middle" font-size="${
          el.fontSize * 0.9
        }" fill="#FFFFFF" font-weight="700">${escapeHtml(`${percent}%`)}</text>`
      );
    })
    .join('');

  const legend = labels
    .map((label, i) => {
      const x = round(box.left + 8);
      const y = round(box.top + box.plotHeight + el.fontSize * 1.5);
      const step = box.plotWidth / labels.length;
      return (
        `<rect x="${round(x + step * i)}" y="${round(y - el.fontSize * 0.8)}" width="${round(
          el.fontSize * 0.8,
        )}" height="${round(el.fontSize * 0.8)}" rx="2" fill="${escapeHtml(colorAt(el, i))}" />` +
        `<text x="${round(x + step * i + el.fontSize * 1.1)}" y="${y}" font-size="${
          el.fontSize * 0.9
        }" fill="${escapeHtml(el.color)}">${escapeHtml(label)}</text>`
      );
    })
    .join('');

  return slices + legend;
}

/** 把圖表元素畫成一段 SVG 字串。 */
export function buildChartSvg(el: ChartElement): string {
  const { labels, values } = alignSeries(el);
  if (labels.length === 0) return emptyChart(el);

  const body =
    el.chartType === 'pie'
      ? pieChart(el, labels, values)
      : el.chartType === 'line'
        ? lineChart(el, labels, values)
        : barChart(el, labels, values);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${el.width} ${el.height}" width="100%" height="100%"`,
    ` font-family="${escapeHtml(el.fontFamily ?? 'inherit')}">`,
    titleSvg(el),
    body,
    '</svg>',
  ].join('');
}
