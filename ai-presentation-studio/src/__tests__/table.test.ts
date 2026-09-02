import { describe, expect, it } from 'vitest';
import { createTableElement } from '../model/factory';
import {
  insertTableColumn,
  insertTableRow,
  removeTableColumn,
  removeTableRow,
  setTableCell,
  tableCellRects,
} from '../model/table';

function table() {
  return createTableElement({ x: 0, y: 0, width: 900, height: 400, rows: 2, columns: 3 });
}

describe('表格', () => {
  it('預設產生指定的列數與欄數，欄寬平均分配', () => {
    const el = table();

    expect(el.cells).toHaveLength(2);
    expect(el.cells[0]).toHaveLength(3);
    expect(el.columnWidths).toHaveLength(3);
    expect(el.columnWidths.reduce((sum, w) => sum + w, 0)).toBeCloseTo(1, 6);
  });

  it('算得出每一格的位置與大小', () => {
    const rects = tableCellRects(table());

    expect(rects).toHaveLength(6);
    expect(rects[0]).toEqual({ row: 0, col: 0, x: 0, y: 0, width: 300, height: 200 });
    expect(rects[5]).toEqual({ row: 1, col: 2, x: 600, y: 200, width: 300, height: 200 });
  });

  it('寫入儲存格不會改到原本的表格', () => {
    const el = table();
    const next = setTableCell(el, 1, 2, '你好');

    expect(next.cells[1][2]).toBe('你好');
    expect(el.cells[1][2]).toBe('');
  });

  it('插入列與欄之後，欄寬總和仍然是 1', () => {
    const withRow = insertTableRow(table(), 1);
    const withColumn = insertTableColumn(withRow, 1);

    expect(withRow.cells).toHaveLength(3);
    expect(withColumn.cells[0]).toHaveLength(4);
    expect(withColumn.columnWidths).toHaveLength(4);
    expect(withColumn.columnWidths.reduce((sum, w) => sum + w, 0)).toBeCloseTo(1, 6);
  });

  it('刪除列與欄之後，欄寬總和仍然是 1', () => {
    const next = removeTableColumn(removeTableRow(table(), 0), 0);

    expect(next.cells).toHaveLength(1);
    expect(next.cells[0]).toHaveLength(2);
    expect(next.columnWidths.reduce((sum, w) => sum + w, 0)).toBeCloseTo(1, 6);
  });

  it('至少保留一列一欄', () => {
    let rows = removeTableRow(table(), 0);
    rows = removeTableRow(rows, 0);
    let single = removeTableColumn(rows, 0);
    single = removeTableColumn(single, 0);
    single = removeTableColumn(single, 0);

    expect(rows.cells).toHaveLength(1);
    expect(single.cells[0]).toHaveLength(1);
  });
});
