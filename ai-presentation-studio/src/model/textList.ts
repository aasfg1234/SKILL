import type { ListStyle } from './types';

export interface ListLine {
  /** 行首符號；空白行沒有符號 */
  marker: string;
  text: string;
}

/**
 * 把一段文字拆成帶符號的行。
 *
 * 顯示、匯出、編輯三邊都用這一份規則，才不會三種地方長得不一樣。
 * 空白行不給符號，也不佔用編號，這樣使用者可以用空行分段。
 */
export function normalizeListStyle(value: unknown): ListStyle {
  return value === 'bullet' || value === 'number' ? value : 'none';
}

export function formatListLines(text: string, listStyle: ListStyle): ListLine[] {
  const style = normalizeListStyle(listStyle);
  const lines = String(text ?? '').split('\n');
  let counter = 0;

  return lines.map((line) => {
    if (style === 'none' || line.trim() === '') {
      return { marker: '', text: line };
    }
    if (style === 'bullet') {
      return { marker: '•', text: line };
    }
    counter += 1;
    return { marker: `${counter}.`, text: line };
  });
}
