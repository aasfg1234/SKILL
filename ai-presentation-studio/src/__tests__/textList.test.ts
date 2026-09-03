import { describe, expect, it } from 'vitest';
import { formatListLines, normalizeListStyle } from '../model/textList';

describe('舊資料相容', () => {
  it('沒有條列欄位的舊存檔一律當成不使用清單', () => {
    expect(normalizeListStyle(undefined)).toBe('none');
    expect(normalizeListStyle(null)).toBe('none');
    expect(normalizeListStyle('亂寫的值')).toBe('none');
    expect(normalizeListStyle('bullet')).toBe('bullet');
    expect(normalizeListStyle('number')).toBe('number');
  });

  it('條列欄位不見時不會亂加編號', () => {
    expect(formatListLines('標題', undefined as never)).toEqual([{ marker: '', text: '標題', level: 0 }]);
  });
});

describe('項目符號', () => {
  it('不使用清單時每一行都沒有符號', () => {
    expect(formatListLines('第一行\n第二行', 'none')).toEqual([
      { marker: '', text: '第一行', level: 0 },
      { marker: '', text: '第二行', level: 0 },
    ]);
  });

  it('項目符號每一行都加上圓點', () => {
    expect(formatListLines('蘋果\n香蕉', 'bullet')).toEqual([
      { marker: '•', text: '蘋果', level: 0 },
      { marker: '•', text: '香蕉', level: 0 },
    ]);
  });

  it('編號依序遞增', () => {
    expect(formatListLines('甲\n乙\n丙', 'number').map((line) => line.marker)).toEqual([
      '1.',
      '2.',
      '3.',
    ]);
  });

  it('空白行不給符號，也不佔用編號', () => {
    expect(formatListLines('甲\n\n乙', 'number')).toEqual([
      { marker: '1.', text: '甲', level: 0 },
      { marker: '', text: '', level: 0 },
      { marker: '2.', text: '乙', level: 0 },
    ]);
  });

  it('空字串仍然回傳一行，避免版面塌掉', () => {
    expect(formatListLines('', 'bullet')).toEqual([{ marker: '', text: '', level: 0 }]);
  });
});
