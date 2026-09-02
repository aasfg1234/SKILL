import { describe, expect, it } from 'vitest';
import { LAYER } from '../lib/layers';

/**
 * 畫布內的浮層（選取框、輔助線、浮動工具列、重疊警告）曾經用 10000 以上的 z-index，
 * 蓋過只有 120 的對話框。這組測試把層級順序固定下來，避免再次發生。
 */
describe('介面層級順序', () => {
  it('畫布浮層一律低於下拉選單、播放、對話框與提示', () => {
    const canvasTop = Math.max(LAYER.canvasOverlay, LAYER.canvasBadge, LAYER.canvasMotion);

    expect(canvasTop).toBeLessThan(LAYER.menu);
    expect(canvasTop).toBeLessThan(LAYER.preview);
    expect(canvasTop).toBeLessThan(LAYER.dialog);
    expect(canvasTop).toBeLessThan(LAYER.toast);
  });

  it('對話框高於播放與選單，提示高於對話框', () => {
    expect(LAYER.dialog).toBeGreaterThan(LAYER.preview);
    expect(LAYER.preview).toBeGreaterThan(LAYER.menu);
    expect(LAYER.toast).toBeGreaterThan(LAYER.dialog);
  });

  it('投影片拖曳中的縮圖低於下拉選單', () => {
    expect(LAYER.slideDrag).toBeLessThan(LAYER.menu);
  });
});
