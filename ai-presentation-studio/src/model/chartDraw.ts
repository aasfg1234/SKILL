import { escapeHtml } from './sanitize';
import type { ChartElement, ChartSeries } from './types';
import {
  DEFAULT_CHART_COLORS,
  axisRange,
  categoryLabelPlan,
  estimateTextWidth,
  formatAxisValue,
  seriesOf,
  type AxisRange,
  type LabelPlan,
} from './chart';

/**
 * 圖表的繪製。
 *
 * 與 `chart.ts` 分開，是因為那邊放的是「資料層」的純函式
 * （數列操作、座標軸計算、貼上解析），這邊只負責把資料畫成 SVG。
 *
 * 一律產生 SVG「字串」，編輯器與 HTML Renderer 共用同一份，
 * 畫出來保證一模一樣，Renderer 也維持不依賴 React。
 */

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function colorAt(el: ChartElement, index: number): string {
  const palette = el.colors.length > 0 ? el.colors : DEFAULT_CHART_COLORS;
  return palette[index % palette.length];
}

/** 標籤與每一組數列都對齊成相同長度：不足補零，多的忽略。 */
function aligned(el: ChartElement): { labels: string[]; series: ChartSeries[] } {
  const labels = el.labels.map((label) => String(label ?? ''));
  const series = seriesOf(el).map((s) => ({
    name: String(s.name ?? ''),
    values: labels.map((_, i) => (Number.isFinite(s.values[i]) ? Number(s.values[i]) : 0)),
  }));
  return { labels, series };
}

function emptyChart(el: ChartElement): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${el.width} ${el.height}" width="100%" height="100%">`,
    `<text x="${el.width / 2}" y="${el.height / 2}" text-anchor="middle" dominant-baseline="middle"`,
    ` font-size="${el.fontSize * 1.2}" fill="${escapeHtml(el.color)}" opacity="0.5">尚未輸入資料</text>`,
    '</svg>',
  ].join('');
}

function titleSvg(el: ChartElement): string {
  if (!el.title.trim()) return '';
  return `<text x="${el.width / 2}" y="${el.fontSize * 1.5}" text-anchor="middle" font-size="${
    el.fontSize * 1.25
  }" font-weight="700" fill="${escapeHtml(el.color)}">${escapeHtml(el.title)}</text>`;
}

/** 只有一組沒有名字的數列時，圖例沒有意義，不畫。 */
function wantsLegend(el: ChartElement, series: ChartSeries[]): boolean {
  if (!el.showLegend) return false;
  return series.length > 1 || series.some((s) => s.name.trim() !== '');
}

/** 沒有取名的數列，在圖例上顯示「數列 N」，不要留空白。 */
function legendNames(series: ChartSeries[]): string[] {
  return series.map((s, i) => (s.name.trim() ? s.name : `數列 ${i + 1}`));
}

/** 直向排列的圖例，放在右側；名稱再長也不會互相重疊。 */
function legendSvg(
  el: ChartElement,
  names: string[],
  x: number,
  centerY: number,
  fontSize: number,
): string {
  const rowHeight = fontSize * 1.9;
  const top = round(centerY - (names.length * rowHeight) / 2 + rowHeight / 2);
  return names
    .map((name, i) => {
      const y = round(top + rowHeight * i);
      return (
        `<rect x="${round(x)}" y="${round(y - fontSize * 0.7)}" width="${round(
          fontSize * 0.9,
        )}" height="${round(fontSize * 0.9)}" rx="2" fill="${escapeHtml(colorAt(el, i))}" />` +
        `<text x="${round(x + fontSize * 1.4)}" y="${y}" font-size="${fontSize}" fill="${escapeHtml(
          el.color,
        )}">${escapeHtml(name)}</text>`
      );
    })
    .join('');
}

function legendWidthOf(el: ChartElement, names: string[], fontSize: number): number {
  if (names.length === 0) return 0;
  const widest = Math.max(...names.map((n) => estimateTextWidth(n, fontSize)));
  return Math.min(el.width * 0.42, widest + fontSize * 2.4) + 16;
}

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

function valueLabelSvg(el: ChartElement, x: number, y: number, value: number, anchor = 'middle'): string {
  if (!el.showValues) return '';
  return `<text x="${round(x)}" y="${round(y)}" text-anchor="${anchor}" font-size="${
    el.fontSize * 0.9
  }" fill="${escapeHtml(el.color)}">${escapeHtml(formatAxisValue(value))}</text>`;
}

/* ------------------------------------------------------------------ */
/* 直向：長條圖與折線圖                                                 */
/* ------------------------------------------------------------------ */

function verticalLayout(
  el: ChartElement,
  labels: string[],
  range: AxisRange,
  legendWidth: number,
): { box: Box; plan: LabelPlan } {
  const axisFont = el.fontSize * 0.85;
  const widestAxis = Math.max(
    ...range.ticks.map((tick) => estimateTextWidth(formatAxisValue(tick), axisFont)),
  );
  const left = Math.max(48, widestAxis + 20);
  const right = 24 + legendWidth;
  const top = el.title.trim() ? el.fontSize * 2.4 + 16 : 24;
  const slot = Math.max(1, (el.width - left - right) / Math.max(1, labels.length));
  const plan = categoryLabelPlan(labels, slot, el.fontSize);
  const widestLabel = Math.max(0, ...labels.map((l) => estimateTextWidth(l, plan.fontSize)));
  const bottom = plan.rotate
    ? Math.min(el.height * 0.4, widestLabel * 0.58 + plan.fontSize) + 16
    : plan.fontSize * 2.2 + 16;

  return {
    box: {
      left,
      right,
      top,
      bottom,
      width: Math.max(1, el.width - left - right),
      height: Math.max(1, el.height - top - bottom),
    },
    plan,
  };
}

function verticalAxis(el: ChartElement, box: Box, range: AxisRange, y: (v: number) => number): string {
  const axisFont = el.fontSize * 0.85;
  return range.ticks
    .map((tick) => {
      const py = y(tick);
      const zero = tick === 0 && range.min < 0;
      return (
        `<line x1="${box.left}" y1="${py}" x2="${round(box.left + box.width)}" y2="${py}" stroke="${escapeHtml(
          el.gridColor,
        )}" stroke-width="${zero ? 2 : 1}" />` +
        `<text x="${box.left - 10}" y="${py + axisFont * 0.35}" text-anchor="end" font-size="${axisFont}" fill="${escapeHtml(
          el.color,
        )}" opacity="0.65">${escapeHtml(formatAxisValue(tick))}</text>`
      );
    })
    .join('');
}

function verticalCategories(el: ChartElement, box: Box, labels: string[], plan: LabelPlan): string {
  const slot = box.width / labels.length;
  return labels
    .map((label, i) => {
      const x = round(box.left + slot * i + slot / 2);
      const y = round(box.top + box.height + plan.fontSize * 1.4);
      const common = `font-size="${plan.fontSize}" fill="${escapeHtml(el.color)}"`;
      if (!plan.rotate) {
        return `<text x="${x}" y="${y}" text-anchor="middle" ${common}>${escapeHtml(label)}</text>`;
      }
      return `<text x="${x}" y="${y}" text-anchor="end" ${common} transform="rotate(${plan.rotate} ${x} ${y})">${escapeHtml(
        label,
      )}</text>`;
    })
    .join('');
}

function barChart(el: ChartElement, labels: string[], series: ChartSeries[]): string {
  const legendFont = el.fontSize * 0.9;
  const names = wantsLegend(el, series) ? legendNames(series) : [];
  const legendWidth = legendWidthOf(el, names, legendFont);
  const range = axisRange(series.flatMap((s) => s.values));
  const { box, plan } = verticalLayout(el, labels, range, legendWidth);
  const span = range.max - range.min || 1;
  const y = (v: number) => round(box.top + box.height - ((v - range.min) / span) * box.height);
  const baseline = y(0);

  const slot = box.width / labels.length;
  const groupWidth = slot * 0.7;
  const barWidth = Math.max(3, groupWidth / series.length);

  const bars = series
    .map((s, si) =>
      s.values
        .map((value, i) => {
          const top = y(value);
          const height = round(Math.abs(top - baseline));
          const x = round(box.left + slot * i + (slot - groupWidth) / 2 + barWidth * si);
          const rectY = round(Math.min(top, baseline));
          const labelY = value < 0 ? rectY + height + el.fontSize : rectY - el.fontSize * 0.4;
          return (
            `<rect x="${x}" y="${rectY}" width="${round(barWidth * 0.92)}" height="${height}" rx="3" fill="${escapeHtml(
              colorAt(el, series.length > 1 ? si : i),
            )}" />` +
            (series.length === 1 ? valueLabelSvg(el, x + barWidth / 2, labelY, value) : '')
          );
        })
        .join(''),
    )
    .join('');

  return (
    verticalAxis(el, box, range, y) +
    bars +
    verticalCategories(el, box, labels, plan) +
    (names.length
      ? legendSvg(el, names, el.width - legendWidth + 8, box.top + box.height / 2, legendFont)
      : '')
  );
}

function lineChart(el: ChartElement, labels: string[], series: ChartSeries[]): string {
  const legendFont = el.fontSize * 0.9;
  const names = wantsLegend(el, series) ? legendNames(series) : [];
  const legendWidth = legendWidthOf(el, names, legendFont);
  const range = axisRange(series.flatMap((s) => s.values));
  const { box, plan } = verticalLayout(el, labels, range, legendWidth);
  const span = range.max - range.min || 1;
  const y = (v: number) => round(box.top + box.height - ((v - range.min) / span) * box.height);
  const slot = box.width / labels.length;

  const lines = series
    .map((s, si) => {
      const stroke = colorAt(el, si);
      const points = s.values.map((value, i) => ({
        x: round(box.left + slot * i + slot / 2),
        y: y(value),
      }));
      const polyline = `<polyline fill="none" stroke="${escapeHtml(
        stroke,
      )}" stroke-width="3" stroke-linejoin="round" points="${points
        .map((p) => `${p.x},${p.y}`)
        .join(' ')}" />`;
      const dots = points
        .map(
          (p, i) =>
            `<circle cx="${p.x}" cy="${p.y}" r="5" fill="${escapeHtml(stroke)}" />` +
            (series.length === 1
              ? valueLabelSvg(el, p.x, p.y - el.fontSize * 0.8, s.values[i])
              : ''),
        )
        .join('');
      return polyline + dots;
    })
    .join('');

  return (
    verticalAxis(el, box, range, y) +
    lines +
    verticalCategories(el, box, labels, plan) +
    (names.length
      ? legendSvg(el, names, el.width - legendWidth + 8, box.top + box.height / 2, legendFont)
      : '')
  );
}

/* ------------------------------------------------------------------ */
/* 橫向長條圖                                                          */
/* ------------------------------------------------------------------ */

/**
 * 橫向長條圖。
 *
 * 類別名稱放左邊、水平書寫，所以再長的中文項目也不需要縮字或轉角度。
 */
function hBarChart(el: ChartElement, labels: string[], series: ChartSeries[]): string {
  const legendFont = el.fontSize * 0.9;
  const names = wantsLegend(el, series) ? legendNames(series) : [];
  const legendWidth = legendWidthOf(el, names, legendFont);
  const range = axisRange(series.flatMap((s) => s.values));
  const axisFont = el.fontSize * 0.85;

  const widestLabel = Math.max(0, ...labels.map((l) => estimateTextWidth(l, el.fontSize)));
  const left = Math.min(el.width * 0.42, widestLabel + 24);
  const right = 24 + legendWidth;
  const top = el.title.trim() ? el.fontSize * 2.4 + 16 : 24;
  const bottom = axisFont * 2.2 + 16;
  const box: Box = {
    left,
    right,
    top,
    bottom,
    width: Math.max(1, el.width - left - right),
    height: Math.max(1, el.height - top - bottom),
  };

  const span = range.max - range.min || 1;
  const x = (v: number) => round(box.left + ((v - range.min) / span) * box.width);
  const baseline = x(0);

  const grid = range.ticks
    .map((tick) => {
      const px = x(tick);
      const zero = tick === 0 && range.min < 0;
      return (
        `<line x1="${px}" y1="${box.top}" x2="${px}" y2="${round(box.top + box.height)}" stroke="${escapeHtml(
          el.gridColor,
        )}" stroke-width="${zero ? 2 : 1}" />` +
        `<text x="${px}" y="${round(box.top + box.height + axisFont * 1.6)}" text-anchor="middle" font-size="${axisFont}" fill="${escapeHtml(
          el.color,
        )}" opacity="0.65">${escapeHtml(formatAxisValue(tick))}</text>`
      );
    })
    .join('');

  const slot = box.height / labels.length;
  const groupHeight = slot * 0.7;
  const barHeight = Math.max(3, groupHeight / series.length);

  const bars = series
    .map((s, si) =>
      s.values
        .map((value, i) => {
          const end = x(value);
          const width = round(Math.abs(end - baseline));
          const y = round(box.top + slot * i + (slot - groupHeight) / 2 + barHeight * si);
          const rectX = round(Math.min(end, baseline));
          return (
            `<rect x="${rectX}" y="${y}" width="${width}" height="${round(
              barHeight * 0.92,
            )}" rx="3" fill="${escapeHtml(colorAt(el, series.length > 1 ? si : i))}" />` +
            (series.length === 1
              ? valueLabelSvg(
                  el,
                  value < 0 ? rectX - 8 : rectX + width + 8,
                  y + barHeight * 0.7,
                  value,
                  value < 0 ? 'end' : 'start',
                )
              : '')
          );
        })
        .join(''),
    )
    .join('');

  const categories = labels
    .map((label, i) => {
      const y = round(box.top + slot * i + slot / 2 + el.fontSize * 0.35);
      return `<text x="${round(box.left - 12)}" y="${y}" text-anchor="end" font-size="${
        el.fontSize
      }" fill="${escapeHtml(el.color)}">${escapeHtml(label)}</text>`;
    })
    .join('');

  return (
    grid +
    bars +
    categories +
    (names.length
      ? legendSvg(el, names, el.width - legendWidth + 8, box.top + box.height / 2, legendFont)
      : '')
  );
}

/* ------------------------------------------------------------------ */
/* 圓餅圖                                                              */
/* ------------------------------------------------------------------ */

/**
 * 圓餅圖。
 *
 * 只看第一組數列：比例圖沒辦法同時表達多組資料。
 * 負數在比例圖上沒有意義，一律當成 0。
 */
function pieChart(el: ChartElement, labels: string[], series: ChartSeries[]): string {
  const values = series[0]?.values ?? [];
  const legendFont = el.fontSize * 0.9;
  const names = el.showLegend ? labels : [];
  const legendWidth = legendWidthOf(el, names, legendFont);
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
        (el.showValues
          ? `<text x="${labelX}" y="${labelY}" text-anchor="middle" dominant-baseline="middle" font-size="${legendFont}" fill="#FFFFFF" font-weight="700">${escapeHtml(
              `${percent}%`,
            )}</text>`
          : '')
      );
    })
    .join('');

  return (
    slices +
    (names.length
      ? legendSvg(el, names, el.width - legendWidth + 8, cy, legendFont)
      : '')
  );
}

/** 把圖表元素畫成一段 SVG 字串。 */
export function buildChartSvg(el: ChartElement): string {
  const { labels, series } = aligned(el);
  if (labels.length === 0) return emptyChart(el);

  const body =
    el.chartType === 'pie'
      ? pieChart(el, labels, series)
      : el.chartType === 'hbar'
        ? hBarChart(el, labels, series)
        : el.chartType === 'line'
          ? lineChart(el, labels, series)
          : barChart(el, labels, series);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${el.width} ${el.height}" width="100%" height="100%"`,
    ` font-family="${escapeHtml(el.fontFamily ?? 'inherit')}">`,
    titleSvg(el),
    body,
    '</svg>',
  ].join('');
}
