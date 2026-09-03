import type { ListStyle } from './types';

export interface ListLine {
  /** 行首符號；空白行沒有符號 */
  marker: string;
  text: string;
  /** 縮排層級，0 是最外層 */
  level: number;
}

/**
 * 把一段文字拆成帶符號的行。
 *
 * 顯示、匯出、編輯三邊都用這一份規則，才不會三種地方長得不一樣。
 * 空白行不給符號，也不佔用編號，這樣使用者可以用空行分段。
 *
 * 行首的 Tab 代表縮排層級：一個 Tab 是第二層，兩個是第三層，依此類推。
 * 用 Tab 而不是另外存一份層級陣列，是因為使用者在文字框裡直接編輯時，
 * 層級會跟著文字一起被複製、貼上、復原，不需要額外同步。
 */

const MAX_LEVEL = 3;
const BULLET_MARKERS = ['•', '◦', '▪'];

export function normalizeListStyle(value: unknown): ListStyle {
  return value === 'bullet' || value === 'number' ? value : 'none';
}

function letterMarker(n: number): string {
  let value = n;
  let out = '';
  while (value > 0) {
    const rest = (value - 1) % 26;
    out = String.fromCharCode(97 + rest) + out;
    value = Math.floor((value - 1) / 26);
  }
  return out;
}

const ROMAN: [number, string][] = [
  [10, 'x'],
  [9, 'ix'],
  [5, 'v'],
  [4, 'iv'],
  [1, 'i'],
];

function romanMarker(n: number): string {
  let value = n;
  let out = '';
  for (const [size, symbol] of ROMAN) {
    while (value >= size) {
      out += symbol;
      value -= size;
    }
  }
  return out || 'i';
}

/** 行首的 Tab 數量就是縮排層級。 */
export function indentLevelOf(line: string): number {
  let level = 0;
  while (level < line.length && line[level] === '\t') level += 1;
  return level;
}

export function formatListLines(text: string, listStyle: ListStyle): ListLine[] {
  const style = normalizeListStyle(listStyle);
  const lines = String(text ?? '').split('\n');
  const counters: number[] = [];

  return lines.map((raw) => {
    const level = indentLevelOf(raw);
    const body = raw.slice(level);
    const capped = Math.min(level, MAX_LEVEL - 1);

    if (style === 'none' || body.trim() === '') {
      return { marker: '', text: body, level };
    }

    if (style === 'bullet') {
      return { marker: BULLET_MARKERS[capped], text: body, level };
    }

    counters.length = Math.max(counters.length, capped + 1);
    for (let i = capped + 1; i < counters.length; i += 1) counters[i] = 0;
    counters[capped] = (counters[capped] ?? 0) + 1;
    const n = counters[capped];
    const marker = capped === 0 ? `${n}.` : capped === 1 ? `${letterMarker(n)}.` : `${romanMarker(n)}.`;

    return { marker, text: body, level };
  });
}

export interface IndentResult {
  text: string;
  selectionStart: number;
  selectionEnd: number;
}

/**
 * 對游標所在的行（或選取範圍內的每一行）增加或減少一層縮排。
 *
 * delta 為 1 是 Tab，-1 是 Shift+Tab。已經在最外層時再減少不會有變化。
 */
export function changeIndent(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  delta: number,
): IndentResult {
  const lines = String(text ?? '').split('\n');
  const starts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    starts.push(offset);
    offset += line.length + 1;
  }

  const lineOf = (pos: number): number => {
    let index = 0;
    for (let i = 0; i < starts.length; i += 1) {
      if (pos >= starts[i]) index = i;
    }
    return index;
  };

  const first = lineOf(Math.min(selectionStart, selectionEnd));
  const last = lineOf(Math.max(selectionStart, selectionEnd));
  const shifts = lines.map(() => 0);

  for (let i = first; i <= last; i += 1) {
    if (delta > 0) {
      if (indentLevelOf(lines[i]) >= MAX_LEVEL + 1) continue;
      lines[i] = `\t${lines[i]}`;
      shifts[i] = 1;
    } else if (lines[i].startsWith('\t')) {
      lines[i] = lines[i].slice(1);
      shifts[i] = -1;
    }
  }

  let total = 0;
  for (let i = first; i <= last; i += 1) total += shifts[i];

  return {
    text: lines.join('\n'),
    selectionStart: Math.max(0, selectionStart + shifts[first]),
    selectionEnd: Math.max(0, selectionEnd + total),
  };
}
