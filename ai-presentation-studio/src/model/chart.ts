import type { ChartElement, ChartSeries } from './types';

/**
 * 圖表的資料層：數列操作、座標軸計算、文字排版估算、貼上解析。
 *
 * 真正把資料畫成 SVG 的部分在 `chartDraw.ts`。
 * 兩邊分開，是為了讓這裡維持成一組好測的純函式。
 */

export interface ChartTypeInfo {
  id: ChartElement['chartType'];
  label: string;
  hint: string;
}

export const CHART_TYPES: ChartTypeInfo[] = [
  { id: 'bar', label: '長條圖', hint: '比較各項目的多寡' },
  { id: 'hbar', label: '橫向長條圖', hint: '項目名稱較長時比較好讀' },
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
/* 數列                                                                */
/* ------------------------------------------------------------------ */

/**
 * 讀出圖表的數列。
 *
 * 舊版的圖表只有 `values`，沒有 `series`。
 * 所有讀取一律走這個函式，舊檔就不會壞掉。
 */
export function seriesOf(el: Pick<ChartElement, 'series' | 'values'>): ChartSeries[] {
  if (Array.isArray(el.series) && el.series.length > 0) return el.series;
  return [{ name: '', values: Array.isArray(el.values) ? el.values : [] }];
}

function valueAt(series: ChartSeries, index: number): number {
  const raw = series.values[index];
  return Number.isFinite(raw) ? Number(raw) : 0;
}

/** 依第一組數列排序；所有數列與標籤一起搬，不會錯位。 */
export function sortSeriesRows(
  labels: string[],
  series: ChartSeries[],
  direction: 'asc' | 'desc',
): { labels: string[]; series: ChartSeries[] } {
  const first = series[0];
  const order = labels
    .map((_, i) => i)
    .sort((a, b) => {
      const va = first ? valueAt(first, a) : 0;
      const vb = first ? valueAt(first, b) : 0;
      return direction === 'desc' ? vb - va : va - vb;
    });
  return {
    labels: order.map((i) => labels[i]),
    series: series.map((s) => ({ ...s, values: order.map((i) => valueAt(s, i)) })),
  };
}

/** 把某一列往上或往下搬；到頭了就不動。 */
export function moveSeriesRow(
  labels: string[],
  series: ChartSeries[],
  index: number,
  delta: -1 | 1,
): { labels: string[]; series: ChartSeries[] } {
  const target = index + delta;
  if (index < 0 || index >= labels.length || target < 0 || target >= labels.length) {
    return { labels, series };
  }
  const order = labels.map((_, i) => i);
  [order[index], order[target]] = [order[target], order[index]];
  return {
    labels: order.map((i) => labels[i]),
    series: series.map((s) => ({ ...s, values: order.map((i) => valueAt(s, i)) })),
  };
}

/** 在第 at 列插入一列空白；每一組數列都補零。 */
export function insertSeriesRow(
  labels: string[],
  series: ChartSeries[],
  at: number,
): { labels: string[]; series: ChartSeries[] } {
  const index = Math.min(Math.max(0, at), labels.length);
  const nextLabels = [...labels];
  nextLabels.splice(index, 0, '');
  return {
    labels: nextLabels,
    series: series.map((s) => {
      const values = labels.map((_, i) => valueAt(s, i));
      values.splice(index, 0, 0);
      return { ...s, values };
    }),
  };
}

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
 * 解析從 Excel／Google 試算表複製過來的資料。
 *
 * 第一欄是類別名稱，其餘每一欄各是一組數列。
 * 有 Tab 就用 Tab 分隔（Excel 複製出來就是 Tab），否則用逗號。
 * 第一列如果第二欄不是數字，會被當成標題，用來當數列名稱。
 * 只有一欄時當成名稱，數值補零。看不懂就回傳 null。
 */
export function parsePastedSeries(
  text: string,
): { labels: string[]; series: ChartSeries[] } | null {
  const raw = String(text ?? '');
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
  if (lines.length === 0) return null;

  const byTab = raw.includes('\t');
  const rows = lines.map((line) => {
    const cells = line.split(byTab ? '\t' : ',').map((c) => c.trim());
    if (byTab) return cells;
    // 逗號分隔時，數字裡的千分位會被拆開，把純三位數的碎片接回前一格
    return cells.reduce<string[]>((acc, cell) => {
      const prev = acc[acc.length - 1];
      if (prev !== undefined && /^\d{3}$/.test(cell) && /\d$/.test(prev)) {
        acc[acc.length - 1] = prev + cell;
        return acc;
      }
      acc.push(cell);
      return acc;
    }, []);
  });

  const columns = Math.max(...rows.map((row) => row.length));
  if (columns <= 1) {
    return {
      labels: rows.map((row) => row[0]),
      series: [{ name: '', values: rows.map(() => 0) }],
    };
  }

  const headerRow = rows.length > 1 && toNumber(rows[0][1] ?? '') === null ? rows[0] : null;
  const body = headerRow ? rows.slice(1) : rows;
  if (body.length === 0) return null;

  const seriesCount = columns - 1;
  const series: ChartSeries[] = Array.from({ length: seriesCount }, (_, si) => ({
    name: headerRow ? (headerRow[si + 1] ?? '') : '',
    values: body.map((row) => toNumber(row[si + 1] ?? '') ?? 0),
  }));

  return { labels: body.map((row) => row[0] ?? ''), series };
}
