import { describe, expect, it } from 'vitest';
import { createTableElement } from '../model/factory';
import {
  insertTableColumn,
  insertTableRow,
  isCoveredCell,
  mergeCells,
  mergeCovering,
  removeTableColumn,
  removeTableRow,
  tableCellRects,
  unmergeCells,
} from '../model/table';

function table() {
  return createTableElement({
    x: 0,
    y: 0,
    width: 900,
    height: 400,
    cells: [
      ['A1', 'B1', 'C1'],
      ['A2', 'B2', 'C2'],
    ],
  });
}

describe('表格儲存格合併', () => {
  it('合併兩格之後，被蓋住的那格不再單獨出現', () => {
    const merged = mergeCells(table(), { row: 0, col: 0 }, { row: 0, col: 1 });

    expect(merged.merges).toEqual([{ row: 0, col: 0, rowSpan: 1, colSpan: 2 }]);
    expect(isCoveredCell(merged, 0, 1)).toBe(true);
    expect(isCoveredCell(merged, 0, 0)).toBe(false);
  });

  it('合併時把文字併到左上角那一格，不會弄丟內容', () => {
    const merged = mergeCells(table(), { row: 0, col: 0 }, { row: 1, col: 1 });

    expect(merged.cells[0][0]).toBe('A1 B1 A2 B2');
    expect(merged.cells[0][1]).toBe('');
    expect(merged.cells[1][1]).toBe('');
  });

  it('先點右下再點左上也一樣', () => {
    const merged = mergeCells(table(), { row: 1, col: 2 }, { row: 0, col: 1 });

    expect(merged.merges).toEqual([{ row: 0, col: 1, rowSpan: 2, colSpan: 2 }]);
  });

  it('只選一格不會產生合併', () => {
    const el = table();

    expect(mergeCells(el, { row: 0, col: 0 }, { row: 0, col: 0 })).toBe(el);
  });

  it('合併的格子會佔滿原本那些格的寬高', () => {
    const merged = mergeCells(table(), { row: 0, col: 0 }, { row: 0, col: 1 });
    const rects = tableCellRects(merged);

    expect(rects).toHaveLength(5);
    expect(rects[0]).toMatchObject({ row: 0, col: 0, x: 0, y: 0, width: 600, height: 200 });
    expect(rects.some((r) => r.row === 0 && r.col === 1)).toBe(false);
  });

  it('可以查出某一格屬於哪一個合併', () => {
    const merged = mergeCells(table(), { row: 0, col: 0 }, { row: 1, col: 1 });

    expect(mergeCovering(merged, 1, 1)).toMatchObject({ row: 0, col: 0 });
    expect(mergeCovering(merged, 0, 2)).toBeNull();
  });

  it('取消合併之後，每一格都回來', () => {
    const merged = mergeCells(table(), { row: 0, col: 0 }, { row: 1, col: 1 });
    const back = unmergeCells(merged, 1, 1);

    expect(back.merges ?? []).toEqual([]);
    expect(tableCellRects(back)).toHaveLength(6);
  });

  it('新的合併會蓋掉與它重疊的舊合併', () => {
    const first = mergeCells(table(), { row: 0, col: 0 }, { row: 0, col: 1 });
    const second = mergeCells(first, { row: 0, col: 1 }, { row: 1, col: 2 });

    expect(second.merges).toEqual([{ row: 0, col: 1, rowSpan: 2, colSpan: 2 }]);
  });

  it('插入列之後，下方的合併會跟著往下移', () => {
    const merged = mergeCells(table(), { row: 1, col: 0 }, { row: 1, col: 1 });
    const next = insertTableRow(merged, 0);

    expect(next.merges).toEqual([{ row: 2, col: 0, rowSpan: 1, colSpan: 2 }]);
  });

  it('插入欄之後，右方的合併會跟著往右移', () => {
    const merged = mergeCells(table(), { row: 0, col: 1 }, { row: 0, col: 2 });
    const next = insertTableColumn(merged, 0);

    expect(next.merges).toEqual([{ row: 0, col: 2, rowSpan: 1, colSpan: 2 }]);
  });

  it('刪掉合併範圍內的列或欄時，合併會跟著縮小', () => {
    const merged = mergeCells(table(), { row: 0, col: 0 }, { row: 1, col: 1 });

    // 2×2 的合併刪掉一列之後，剩下橫向的 1×2
    expect(removeTableRow(merged, 0).merges).toEqual([
      { row: 0, col: 0, rowSpan: 1, colSpan: 2 },
    ]);
    // 刪掉一欄之後，剩下直向的 2×1
    expect(removeTableColumn(merged, 0).merges).toEqual([
      { row: 0, col: 0, rowSpan: 2, colSpan: 1 },
    ]);
  });

  it('縮到只剩一格時，合併就自動取消', () => {
    const merged = mergeCells(table(), { row: 0, col: 0 }, { row: 1, col: 0 });

    expect(removeTableRow(merged, 0).merges ?? []).toEqual([]);
  });
});
