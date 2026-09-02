import type { TableElement } from './types';

/**
 * 表格的純函式。
 *
 * 欄寬一律用「佔總寬的比例」，總和保持 1，
 * 這樣表格被縮放時欄位比例不會跑掉。
 *
 * 這一版不支援儲存格合併。
 */

export interface TableCellRect {
  row: number;
  col: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 產生平均分配的欄寬。 */
export function evenColumnWidths(columns: number): number[] {
  const count = Math.max(1, columns);
  return Array.from({ length: count }, () => 1 / count);
}

/** 讓欄寬總和回到 1；全部是 0 時改成平均分配。 */
function normalizeWidths(widths: number[]): number[] {
  const safe = widths.map((w) => (Number.isFinite(w) && w > 0 ? w : 0));
  const total = safe.reduce((sum, w) => sum + w, 0);
  if (total <= 0) return evenColumnWidths(safe.length);
  return safe.map((w) => w / total);
}

/** 算出每一格在元素座標系裡的位置與大小。 */
export function tableCellRects(el: TableElement): TableCellRect[] {
  const rows = el.cells.length;
  const cols = el.cells[0]?.length ?? 0;
  if (rows === 0 || cols === 0) return [];

  const widths = normalizeWidths(el.columnWidths.slice(0, cols));
  const rowHeight = el.height / rows;
  const rects: TableCellRect[] = [];

  for (let row = 0; row < rows; row += 1) {
    let x = 0;
    for (let col = 0; col < cols; col += 1) {
      const width = el.width * (widths[col] ?? 1 / cols);
      rects.push({ row, col, x, y: row * rowHeight, width, height: rowHeight });
      x += width;
    }
  }
  return rects;
}

/** 寫入一格的內容，回傳新的表格。 */
export function setTableCell(
  el: TableElement,
  row: number,
  col: number,
  value: string,
): TableElement {
  const cells = el.cells.map((line, r) =>
    r === row ? line.map((cell, c) => (c === col ? value : cell)) : [...line],
  );
  return { ...el, cells };
}

/** 在第 at 列插入一列空白。 */
export function insertTableRow(el: TableElement, at: number): TableElement {
  const cols = el.cells[0]?.length ?? 1;
  const index = Math.min(Math.max(0, at), el.cells.length);
  const cells = el.cells.map((line) => [...line]);
  cells.splice(index, 0, Array.from({ length: cols }, () => ''));
  return { ...el, cells };
}

/** 刪除第 at 列；至少保留一列。 */
export function removeTableRow(el: TableElement, at: number): TableElement {
  if (el.cells.length <= 1) return el;
  const cells = el.cells.filter((_, r) => r !== at).map((line) => [...line]);
  return { ...el, cells };
}

/** 在第 at 欄插入一欄空白，並重新分配欄寬。 */
export function insertTableColumn(el: TableElement, at: number): TableElement {
  const cols = el.cells[0]?.length ?? 0;
  const index = Math.min(Math.max(0, at), cols);
  const cells = el.cells.map((line) => {
    const next = [...line];
    next.splice(index, 0, '');
    return next;
  });
  const widths = [...normalizeWidths(el.columnWidths.slice(0, cols))];
  widths.splice(index, 0, cols > 0 ? 1 / cols : 1);
  return { ...el, cells, columnWidths: normalizeWidths(widths) };
}

/** 欄寬的下限，避免被拖到看不見。 */
const MIN_COLUMN_RATIO = 0.05;

/**
 * 拖曳第 at 欄右側的欄線。
 *
 * 只影響相鄰的兩欄，其他欄不動，所以整體總和保持 1。
 * 最後一欄右側沒有欄線可拖，原樣回傳。
 */
export function resizeTableColumn(el: TableElement, at: number, delta: number): TableElement {
  const cols = el.cells[0]?.length ?? 0;
  if (at < 0 || at >= cols - 1) return el;

  const widths = normalizeWidths(el.columnWidths.slice(0, cols));
  const pair = widths[at] + widths[at + 1];
  const next = Math.min(
    pair - MIN_COLUMN_RATIO,
    Math.max(MIN_COLUMN_RATIO, widths[at] + delta),
  );
  if (Math.abs(next - widths[at]) < 1e-9) return el;

  widths[at] = next;
  widths[at + 1] = pair - next;
  return { ...el, columnWidths: widths };
}

/** 刪除第 at 欄；至少保留一欄。 */
export function removeTableColumn(el: TableElement, at: number): TableElement {
  const cols = el.cells[0]?.length ?? 0;
  if (cols <= 1) return el;
  const cells = el.cells.map((line) => line.filter((_, c) => c !== at));
  const widths = normalizeWidths(el.columnWidths.slice(0, cols)).filter((_, c) => c !== at);
  return { ...el, cells, columnWidths: normalizeWidths(widths) };
}
