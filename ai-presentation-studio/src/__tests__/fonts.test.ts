import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FONT_ID,
  FONT_CHOICES,
  LATIN_FIRST_FAMILIES,
  LEGACY_FONT_STACKS,
  fontIdOfStack,
  fontStackOf,
  migrateFontStack,
} from '../lib/fonts';

function firstFamily(stack: string): string {
  return stack.split(',')[0].trim().replace(/^["']|["']$/g, '');
}

describe('字型選擇', () => {
  it('每一種字型都以拉丁字型開頭，版面才不會因為換系統而跑掉', () => {
    for (const choice of FONT_CHOICES) {
      expect(LATIN_FIRST_FAMILIES).toContain(firstFamily(choice.stack));
    }
  });

  it('每一種字型都以通用字族收尾，找不到時才有得退', () => {
    for (const choice of FONT_CHOICES) {
      const last = choice.stack.split(',').pop()!.trim();
      expect(['sans-serif', 'serif', 'monospace']).toContain(last);
    }
  });

  it('認不得的代號一律給預設字型', () => {
    expect(fontStackOf('not-exists')).toBe(fontStackOf(DEFAULT_FONT_ID));
    expect(fontStackOf(undefined)).toBe(fontStackOf(DEFAULT_FONT_ID));
  });

  it('字型堆疊可以反查回代號', () => {
    for (const choice of FONT_CHOICES) {
      expect(fontIdOfStack(choice.stack)).toBe(choice.id);
    }
  });

  it('舊版的中文字型優先堆疊會被認成預設字型', () => {
    for (const legacy of LEGACY_FONT_STACKS) {
      expect(fontIdOfStack(legacy)).toBe(DEFAULT_FONT_ID);
    }
  });

  it('舊存檔的字型堆疊會被換成新的拉丁優先版本', () => {
    expect(migrateFontStack(LEGACY_FONT_STACKS[0])).toBe(fontStackOf(DEFAULT_FONT_ID));
  });

  it('使用者自己設定的字型不會被動到', () => {
    expect(migrateFontStack('"我的公司字型",sans-serif')).toBe('"我的公司字型",sans-serif');
    expect(migrateFontStack(undefined)).toBeUndefined();
  });
});
