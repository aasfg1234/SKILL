import { describe, expect, it } from 'vitest';
import { DEFAULT_FULL_AI_FORM, applyQuickPreset, validateFullAiForm } from '../ai/form';

describe('全 AI 生成表單', () => {
  it('主題、目的與觀眾都是必填欄位', () => {
    const errors = validateFullAiForm(DEFAULT_FULL_AI_FORM);
    expect(errors).toMatchObject({ topic: expect.any(String), purpose: expect.any(String), audience: expect.any(String) });
  });

  it('投影片數量與演講時間不合理時會顯示錯誤', () => {
    const errors = validateFullAiForm({ ...DEFAULT_FULL_AI_FORM, topic: '主題', purpose: '目的', audience: '觀眾', slideCount: 31, durationMinutes: 0 });
    expect(errors.slideCount).toContain('3 到 30');
    expect(errors.durationMinutes).toContain('1 到 300');
  });

  it('快速設定會改變內容，但保留使用者已填的主題', () => {
    const next = applyQuickPreset({ ...DEFAULT_FULL_AI_FORM, topic: '我的產品' }, 'product');
    expect(next.topic).toBe('我的產品');
    expect(next.purpose).toContain('產品');
    expect(next.useImages).toBe(true);
  });
});

