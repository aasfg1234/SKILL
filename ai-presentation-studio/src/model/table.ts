import type { TableElement, TableMerge } from './types';

/**
 * 表格的純函式。
 *
 * 欄寬一律用「佔總寬的比例」，總和保持 1，
 * 這樣表格被縮放時欄位比例不會跑掉。
 *
 * 合併用 `merges` 記錄，每一筆是一塊矩形範圍。被範圍蓋住、但不是左上角的格子
 * 不會單獨顯示，也不會出現在 `tableCellRects` 的結果裡。
 */

/** 一次貼上最多接受幾列、幾欄，超過就截斷，避免整個編輯器卡住。 */
export const MAX_PASTE_ROWS = 50;
export const MAX_PASTE_COLUMNS = 20;

/**
 * 把從試算表複製來的文字拆成表格。
 *
 * Excel、Google 試算表複製出來的純文字，欄之間是 Tab、列之間是換行。
 * 沒有 Tab 就代表使用者複製的是普通文字，不要硬轉成表格。
 */
export function parsePastedTable(text: string): string[][] | null {
  const raw = String(text ?? '').replace(/\r\n?/g, '\n');
  if (!raw.trim()) return null;
  if (!raw.includes('\t')) return null;

  const lines = raw.split('\n');
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  if (lines.length === 0) return null;

  const rows = lines.slice(0, MAX_PASTE_ROWS).map((line) => line.split('\t').slice(0, MAX_PASTE_COLUMNS));
  const columns = rows.reduce((most, row) => Math.max(most, row.length), 0);
  if (columns < 2) return null;

  return rows.map((row) => {
    const next = [...row];
    while (next.length < columns) next.push('');
    return next;
  });
}

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

interface CellPos {
  row: number;
  col: number;
}

/** 兩個座標框出來的矩形範圍，順序顛倒也沒關係。 */
function rectOf(a: CellPos, b: CellPos) {
  return {
    row: Math.min(a.row, b.row),
    col: Math.min(a.col, b.col),
    rowSpan: Math.abs(a.row - b.row) + 1,
    colSpan: Math.abs(a.col - b.col) + 1,
  };
}

function overlaps(a: TableMerge, b: TableMerge): boolean {
  return (
    a.col < b.col + b.colSpan &&
    a.col + a.colSpan > b.col &&
    a.row < b.row + b.rowSpan &&
    a.row + a.rowSpan > b.row
  );
}

/** 這一格屬於哪一個合併範圍；沒有就回傳 null。 */
export function mergeCovering(el: TableElement, row: number, col: number): TableMerge | null {
  return (
    (el.merges ?? []).find(
      (m) =>
        row >= m.row && row < m.row + m.rowSpan && col >= m.col && col < m.col + m.colSpan,
    ) ?? null
  );
}

/** 這一格是不是被別人蓋住了（在合併範圍內，但不是左上角）。 */
export function isCoveredCell(el: TableElement, row: number, col: number): boolean {
  const merge = mergeCovering(el, row, col);
  return merge !== null && !(merge.row === row && merge.col === col);
}

/**
 * 合併兩個座標框出來的範圍。
 *
 * 範圍內的文字會併到左上角那一格，不會弄丟。
 * 與新範圍重疊的舊合併會被取代。只選一格時不做任何事。
 */
export function mergeCells(el: TableElement, a: CellPos, b: CellPos): TableElement {
  const rows = el.cells.length;
  const cols = el.cells[0]?.length ?? 0;
  const next = rectOf(a, b);
  if (next.rowSpan * next.colSpan <= 1) return el;
  if (next.row < 0 || next.col < 0) return el;
  if (next.row + next.rowSpan > rows || next.col + next.colSpan > cols) return el;

  const texts: string[] = [];
  const cells = el.cells.map((line, r) =>
    line.map((cell, c) => {
      const inside =
        r >= next.row && r < next.row + next.rowSpan && c >= next.col && c < next.col + next.colSpan;
      if (!inside) return cell;
      if (cell.trim()) texts.push(cell.trim());
      return '';
    }),
  );
  cells[next.row][next.col] = texts.join(' ');

  const merges = [...(el.merges ?? []).filter((m) => !overlaps(m, next)), next];
  return { ...el, cells, merges };
}

/** 取消這一格所屬的合併。 */
export function unmergeCells(el: TableElement, row: number, col: number): TableElement {
  const merge = mergeCovering(el, row, col);
  if (!merge) return el;
  return { ...el, merges: (el.merges ?? []).filter((m) => m !== merge) };
}

/** 插入或刪除列欄之後，重新整理合併範圍；越界或已經沒有跨格的就丟掉。 */
function fixMerges(merges: TableMerge[], rows: number, cols: number): TableMerge[] {
  return merges.filter(
    (m) =>
      m.rowSpan * m.colSpan > 1 &&
      m.row >= 0 &&
      m.col >= 0 &&
      m.row + m.rowSpan <= rows &&
      m.col + m.colSpan <= cols,
  );
}

/** 算出每一格在元素座標系裡的位置與大小。 */
export function tableCellRects(el: TableElement): TableCellRect[] {
  const rows = el.cells.length;
  const cols = el.cells[0]?.length ?? 0;
  if (rows === 0 || cols === 0) return [];

  const widths = normalizeWidths(el.columnWidths.slice(0, cols));
  const rowHeight = el.height / rows;
  const offsets: number[] = [];
  let acc = 0;
  for (let col = 0; col < cols; col += 1) {
    offsets.push(acc);
    acc += el.width * (widths[col] ?? 1 / cols);
  }

  const rects: TableCellRect[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (isCoveredCell(el, row, col)) continue;
      const merge = mergeCovering(el, row, col);
      const colSpan = merge?.colSpan ?? 1;
      const rowSpan = merge?.rowSpan ?? 1;
      const width = widths
        .slice(col, col + colSpan)
        .reduce((sum, w) => sum + el.width * w, 0);
      rects.push({
        row,
        col,
        x: offsets[col],
        y: row * rowHeight,
        width,
        height: rowHeight * rowSpan,
      });
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
  const merges = (el.merges ?? []).map((m) =>
    m.row >= index
      ? { ...m, row: m.row + 1 }
      : m.row + m.rowSpan > index
        ? { ...m, rowSpan: m.rowSpan + 1 }
        : m,
  );
  return { ...el, cells, merges: fixMerges(merges, cells.length, cols) };
}

/** 刪除第 at 列；至少保留一列。 */
export function removeTableRow(el: TableElement, at: number): TableElement {
  if (el.cells.length <= 1) return el;
  const cells = el.cells.filter((_, r) => r !== at).map((line) => [...line]);
  const merges = (el.merges ?? [])
    .map((m) =>
      m.row > at
        ? { ...m, row: m.row - 1 }
        : m.row + m.rowSpan > at
          ? { ...m, rowSpan: m.rowSpan - 1 }
          : m,
    )
    .filter((m) => m.rowSpan > 0);
  return { ...el, cells, merges: fixMerges(merges, cells.length, cells[0]?.length ?? 0) };
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
  const merges = (el.merges ?? []).map((m) =>
    m.col >= index
      ? { ...m, col: m.col + 1 }
      : m.col + m.colSpan > index
        ? { ...m, colSpan: m.colSpan + 1 }
        : m,
  );
  return {
    ...el,
    cells,
    columnWidths: normalizeWidths(widths),
    merges: fixMerges(merges, cells.length, cells[0]?.length ?? 0),
  };
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
  const merges = (el.merges ?? [])
    .map((m) =>
      m.col > at
        ? { ...m, col: m.col - 1 }
        : m.col + m.colSpan > at
          ? { ...m, colSpan: m.colSpan - 1 }
          : m,
    )
    .filter((m) => m.colSpan > 0);
  return {
    ...el,
    cells,
    columnWidths: normalizeWidths(widths),
    merges: fixMerges(merges, cells.length, cells[0]?.length ?? 0),
  };
}
