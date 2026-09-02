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

/* ------------------------------------------------------------------ */
/* 座標軸                                                              */
/* ------------------------------------------------------------------ */

export interface AxisRange {
  min: number;
  max: number;
  step: number;
  ticks: number[];
}

/** 把一個粗略的間距調整成 1、2、5 或 10 的倍數，刻度才好讀。 */
function niceStep(rough: number): number {
  if (!Number.isFinite(rough) || rough <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(rough)));
  const f = rough / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nice * exp;
}

/** 消除浮點誤差，避免 0.30000000000000004 這種刻度。 */
function tidy(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/**
 * 依資料算出座標軸的範圍與刻度。
 *
 * 一定包含 0；有負數時軸會往下延伸。
 * 間距依資料大小自動決定，所以小數與大數都畫得出合理的刻度。
 */
export function axisRange(values: number[]): AxisRange {
  const usable = values.filter((v) => Number.isFinite(v));
  const rawMax = Math.max(0, ...usable);
  const rawMin = Math.min(0, ...usable);

  if (rawMax === 0 && rawMin === 0) {
    return { min: 0, max: 1, step: 0.25, ticks: [0, 0.25, 0.5, 0.75, 1] };
  }

  const step = niceStep((rawMax - rawMin) / 4);
  const max = tidy(Math.ceil(rawMax / step) * step);
  const min = tidy(Math.floor(rawMin / step) * step);
  const ticks: number[] = [];
  for (let v = min; v <= max + step / 2; v += step) ticks.push(tidy(v));

  return { min, max, step, ticks };
}

/** 座標軸與數值標籤的寫法：大數字加千分位，小數只留必要的位數。 */
export function formatAxisValue(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const rounded = Math.round(value * 1e6) / 1e6;
  const [intPart, decimals] = String(Math.abs(rounded)).split('.');
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const sign = rounded < 0 ? '-' : '';
  return decimals ? `${sign}${withCommas}.${decimals}` : `${sign}${withCommas}`;
}

/* ------------------------------------------------------------------ */
/* 文字排版                                                            */
/* ------------------------------------------------------------------ */

/**
 * 估算一段文字的寬度。
 *
 * Renderer 不能用瀏覽器量測，所以用近似值：
 * 中日韓字元約佔一個字寬，英數與標點約佔 0.6 個。
 */
export function estimateTextWidth(text: string, fontSize: number): number {
  let units = 0;
  for (const ch of String(text ?? '')) {
    units += /[　-鿿＀-￯]/.test(ch) ? 1 : 0.6;
  }
  return Math.round(units * fontSize * 10) / 10;
}

export interface LabelPlan {
  fontSize: number;
  /** 旋轉角度；0 代表水平 */
  rotate: number;
}

/**
 * 決定類別標籤怎麼放才不會疊在一起。
 *
 * 先試原本的字級，放不下就縮小（最多縮到六成），還是放不下就轉 35 度。
 */
export function categoryLabelPlan(
  labels: string[],
  slotWidth: number,
  fontSize: number,
): LabelPlan {
  if (labels.length === 0) return { fontSize, rotate: 0 };
  const widest = Math.max(...labels.map((label) => estimateTextWidth(label, fontSize)));
  const room = slotWidth * 0.95;
  if (widest <= room) return { fontSize, rotate: 0 };

  const minSize = fontSize * 0.6;
  const wanted = (room / widest) * fontSize;
  const size = Math.max(minSize, wanted);
  const fits = widest * (size / fontSize) <= room;
  return { fontSize: Math.round(size), rotate: fits ? 0 : -35 };
}

/* ------------------------------------------------------------------ */
/* 從試算表貼上                                                        */
/* ------------------------------------------------------------------ */

function toNumber(raw: string): number | null {
  const cleaned = raw.replace(/[,\s]/g, '').replace(/[％%]$/, '');
  if (cleaned === '') return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/**
 * 解析從 Excel／Google 試算表複製過來的兩欄資料。
 *
 * 支援 Tab 或逗號分隔。第一列如果第二欄不是數字，會被當成標題略過。
 * 只有一欄時當成名稱，數值補零。看不懂就回傳 null。
 */
export function parsePastedSeries(
  text: string,
): { labels: string[]; values: number[] } | null {
  const lines = String(text ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
  if (lines.length === 0) return null;

  const rows = lines.map((line) => line.split(/\t|,(?=\s*(?:[^\d]|$))|,/).map((c) => c.trim()));
  const hasSecond = rows.some((row) => row.length > 1);

  const parsed = rows.map((row) => {
    if (!hasSecond) return { label: row[0], value: 0 };
    // 數字裡的千分位逗號會被拆開，把後面的欄位接回來再解析
    const label = row[0];
    const rest = row.slice(1).join('');
    return { label, value: toNumber(rest) };
  });

  const body =
    hasSecond && parsed.length > 1 && parsed[0].value === null ? parsed.slice(1) : parsed;
  const usable = body.filter((row) => row.label !== '' || row.value !== null);
  if (usable.length === 0) return null;

  return {
    labels: usable.map((row) => row.label),
    values: usable.map((row) => (row.value === null ? 0 : row.value)),
  };
}

/* ------------------------------------------------------------------ */
/* 畫圖                                                                */
/* ------------------------------------------------------------------ */

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
  labelPlan: LabelPlan;
}

/** 版面留白依實際內容計算：左邊看軸標籤多寬，下面看類別標籤怎麼放。 */
function layoutOf(el: ChartElement, labels: string[], range: AxisRange): Layout {
  const axisFont = el.fontSize * 0.85;
  const widestAxis = Math.max(
    ...range.ticks.map((tick) => estimateTextWidth(formatAxisValue(tick), axisFont)),
  );
  const left = Math.max(48, widestAxis + 20);
  const right = 24;
  const top = el.title.trim() ? el.fontSize * 2.4 + 16 : 24;

  const slot = Math.max(1, (el.width - left - right) / Math.max(1, labels.length));
  const labelPlan = categoryLabelPlan(labels, slot, el.fontSize);
  const widestLabel = Math.max(
    0,
    ...labels.map((label) => estimateTextWidth(label, labelPlan.fontSize)),
  );
  const bottom = labelPlan.rotate
    ? Math.min(el.height * 0.4, widestLabel * 0.58 + labelPlan.fontSize) + 16
    : labelPlan.fontSize * 2.2 + 16;

  return {
    left,
    right,
    top,
    bottom,
    plotWidth: Math.max(1, el.width - left - right),
    plotHeight: Math.max(1, el.height - top - bottom),
    labelPlan,
  };
}

function titleSvg(el: ChartElement): string {
  if (!el.title.trim()) return '';
  return `<text x="${el.width / 2}" y="${el.fontSize * 1.5}" text-anchor="middle" font-size="${
    el.fontSize * 1.25
  }" font-weight="700" fill="${escapeHtml(el.color)}">${escapeHtml(el.title)}</text>`;
}

/** 把數值換算成畫布上的 y 座標。 */
function yScale(box: Layout, range: AxisRange) {
  const span = range.max - range.min || 1;
  return (value: number) =>
    round(box.top + box.plotHeight - ((value - range.min) / span) * box.plotHeight);
}

function axisSvg(el: ChartElement, box: Layout, range: AxisRange): string {
  const y = yScale(box, range);
  const axisFont = el.fontSize * 0.85;
  return range.ticks
    .map((tick) => {
      const py = y(tick);
      const zero = tick === 0 && range.min < 0;
      return (
        `<line x1="${box.left}" y1="${py}" x2="${round(box.left + box.plotWidth)}" y2="${py}" stroke="${escapeHtml(
          el.gridColor,
        )}" stroke-width="${zero ? 2 : 1}" />` +
        `<text x="${box.left - 10}" y="${py + axisFont * 0.35}" text-anchor="end" font-size="${axisFont}" fill="${escapeHtml(
          el.color,
        )}" opacity="0.65">${escapeHtml(formatAxisValue(tick))}</text>`
      );
    })
    .join('');
}

function categoryLabelsSvg(el: ChartElement, box: Layout, labels: string[]): string {
  const slot = box.plotWidth / labels.length;
  const { fontSize, rotate } = box.labelPlan;
  return labels
    .map((label, i) => {
      const x = round(box.left + slot * i + slot / 2);
      const y = round(box.top + box.plotHeight + fontSize * 1.4);
      const common = `font-size="${fontSize}" fill="${escapeHtml(el.color)}"`;
      if (!rotate) {
        return `<text x="${x}" y="${y}" text-anchor="middle" ${common}>${escapeHtml(label)}</text>`;
      }
      return `<text x="${x}" y="${y}" text-anchor="end" ${common} transform="rotate(${rotate} ${x} ${y})">${escapeHtml(
        label,
      )}</text>`;
    })
    .join('');
}

function valueLabelSvg(el: ChartElement, x: number, y: number, value: number): string {
  if (!el.showValues) return '';
  return `<text x="${round(x)}" y="${round(y)}" text-anchor="middle" font-size="${
    el.fontSize * 0.9
  }" fill="${escapeHtml(el.color)}">${escapeHtml(formatAxisValue(value))}</text>`;
}

function barChart(el: ChartElement, labels: string[], values: number[], box: Layout, range: AxisRange): string {
  const y = yScale(box, range);
  const baseline = y(0);
  const slot = box.plotWidth / labels.length;
  const barWidth = Math.max(4, slot * 0.55);

  const bars = values
    .map((value, i) => {
      const top = y(value);
      const height = round(Math.abs(top - baseline));
      const x = round(box.left + slot * i + (slot - barWidth) / 2);
      const rectY = round(Math.min(top, baseline));
      const labelY = value < 0 ? rectY + height + el.fontSize : rectY - el.fontSize * 0.4;
      return (
        `<rect x="${x}" y="${rectY}" width="${round(barWidth)}" height="${height}" rx="4" fill="${escapeHtml(
          colorAt(el, i),
        )}" />` + valueLabelSvg(el, x + barWidth / 2, labelY, value)
      );
    })
    .join('');

  return axisSvg(el, box, range) + bars + categoryLabelsSvg(el, box, labels);
}

function lineChart(el: ChartElement, labels: string[], values: number[], box: Layout, range: AxisRange): string {
  const y = yScale(box, range);
  const slot = box.plotWidth / labels.length;
  const points = values.map((value, i) => ({
    x: round(box.left + slot * i + slot / 2),
    y: y(value),
  }));
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

  return axisSvg(el, box, range) + polyline + dots + categoryLabelsSvg(el, box, labels);
}

/**
 * 圓餅圖。
 *
 * 圖例改成放右側並直向排列，標籤再長也不會互相重疊。
 * 負數在比例圖上沒有意義，一律當成 0。
 */
function pieChart(el: ChartElement, labels: string[], values: number[]): string {
  const legendFont = el.fontSize * 0.9;
  const widestLabel = Math.max(0, ...labels.map((l) => estimateTextWidth(l, legendFont)));
  const legendWidth = Math.min(el.width * 0.42, widestLabel + legendFont * 2.4);
  const top = el.title.trim() ? el.fontSize * 2.4 + 16 : 24;
  const areaWidth = Math.max(1, el.width - legendWidth - 48);
  const areaHeight = Math.max(1, el.height - top - 24);
  const cx = round(24 + areaWidth / 2);
  const cy = round(top + areaHeight / 2);
  const radius = round(Math.max(8, Math.min(areaWidth, areaHeight) / 2 - 8));

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
        `<text x="${labelX}" y="${labelY}" text-anchor="middle" dominant-baseline="middle" font-size="${legendFont}" fill="#FFFFFF" font-weight="700">${escapeHtml(
          `${percent}%`,
        )}</text>`
      );
    })
    .join('');

  const rowHeight = legendFont * 1.9;
  const legendTop = round(cy - (labels.length * rowHeight) / 2 + rowHeight / 2);
  const legendX = round(el.width - legendWidth - 8);
  const legend = labels
    .map((label, i) => {
      const y = round(legendTop + rowHeight * i);
      return (
        `<rect x="${legendX}" y="${round(y - legendFont * 0.7)}" width="${round(
          legendFont * 0.9,
        )}" height="${round(legendFont * 0.9)}" rx="2" fill="${escapeHtml(colorAt(el, i))}" />` +
        `<text x="${round(legendX + legendFont * 1.4)}" y="${y}" font-size="${legendFont}" fill="${escapeHtml(
          el.color,
        )}">${escapeHtml(label)}</text>`
      );
    })
    .join('');

  return slices + legend;
}

/** 把圖表元素畫成一段 SVG 字串。 */
export function buildChartSvg(el: ChartElement): string {
  const { labels, values } = alignSeries(el);
  if (labels.length === 0) return emptyChart(el);

  let body: string;
  if (el.chartType === 'pie') {
    body = pieChart(el, labels, values);
  } else {
    const range = axisRange(values);
    const box = layoutOf(el, labels, range);
    body =
      el.chartType === 'line'
        ? lineChart(el, labels, values, box, range)
        : barChart(el, labels, values, box, range);
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${el.width} ${el.height}" width="100%" height="100%"`,
    ` font-family="${escapeHtml(el.fontFamily ?? 'inherit')}">`,
    titleSvg(el),
    body,
    '</svg>',
  ].join('');
}
