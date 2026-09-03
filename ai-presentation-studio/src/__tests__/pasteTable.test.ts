import { describe, expect, it } from 'vitest';
import { MAX_PASTE_COLUMNS, MAX_PASTE_ROWS, parsePastedTable } from '../model/table';
import { pickImageFromClipboard } from '../lib/images';

function file(type: string, name = 'x') {
  return { type, name } as unknown as File;
}

describe('從試算表貼上表格', () => {
  it('用 Tab 分欄、換行分列', () => {
    expect(parsePastedTable('姓名\t分數\n小明\t90\n小華\t85')).toEqual([
      ['姓名', '分數'],
      ['小明', '90'],
      ['小華', '85'],
    ]);
  });

  it('Windows 的換行也認得', () => {
    expect(parsePastedTable('a\tb\r\nc\td')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('每一列補齊到最多欄的那一列', () => {
    expect(parsePastedTable('a\tb\tc\nd\te')).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e', ''],
    ]);
  });

  it('結尾多出來的空行不算一列', () => {
    expect(parsePastedTable('a\tb\n')).toEqual([['a', 'b']]);
  });

  it('沒有 Tab 的純文字不是表格', () => {
    expect(parsePastedTable('這是一段普通文字')).toBeNull();
    expect(parsePastedTable('第一行\n第二行')).toBeNull();
  });

  it('空白內容不是表格', () => {
    expect(parsePastedTable('')).toBeNull();
    expect(parsePastedTable('   ')).toBeNull();
  });

  it('太大的貼上會截斷，不會把編輯器卡住', () => {
    const row = Array.from({ length: MAX_PASTE_COLUMNS + 5 }, (_, i) => `c${i}`).join('\t');
    const text = Array.from({ length: MAX_PASTE_ROWS + 10 }, () => row).join('\n');
    const table = parsePastedTable(text);

    expect(table).not.toBeNull();
    expect(table).toHaveLength(MAX_PASTE_ROWS);
    expect(table?.[0]).toHaveLength(MAX_PASTE_COLUMNS);
  });

  it('儲存格裡的空白會保留，不會被吃掉', () => {
    expect(parsePastedTable('a b\tc')).toEqual([['a b', 'c']]);
  });
});

describe('從剪貼簿挑出圖片', () => {
  it('files 有圖片時直接用', () => {
    const data = { files: [file('image/png', 'shot.png')], items: [] };

    expect(pickImageFromClipboard(data)?.name).toBe('shot.png');
  });

  it('files 是空的時候改看 items，截圖直接貼上才會成功', () => {
    const png = file('image/png', 'clip.png');
    const data = {
      files: [],
      items: [{ kind: 'file', type: 'image/png', getAsFile: () => png }],
    };

    expect(pickImageFromClipboard(data)?.name).toBe('clip.png');
  });

  it('items 裡的純文字不會被當成圖片', () => {
    const data = {
      files: [],
      items: [{ kind: 'string', type: 'text/plain', getAsFile: () => null }],
    };

    expect(pickImageFromClipboard(data)).toBeNull();
  });

  it('沒有剪貼簿資料也不會壞掉', () => {
    expect(pickImageFromClipboard(null)).toBeNull();
  });
});
