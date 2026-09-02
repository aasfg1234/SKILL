import { describe, expect, it } from 'vitest';
import { previewStepFromKey } from '../model/presenter';

describe('播放換頁按鍵', () => {
  it('往下一頁的按鍵', () => {
    for (const key of ['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter']) {
      expect(previewStepFromKey(key)).toBe(1);
    }
  });

  it('往上一頁的按鍵', () => {
    for (const key of ['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace']) {
      expect(previewStepFromKey(key)).toBe(-1);
    }
  });

  it('其他按鍵不換頁', () => {
    for (const key of ['a', 'Escape', 'F5', 'Shift']) {
      expect(previewStepFromKey(key)).toBe(0);
    }
  });
});
