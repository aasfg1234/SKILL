import { describe, expect, it } from 'vitest';
import { DEFAULT_FULL_AI_FORM } from '../ai/form';
import { MockAIProvider } from '../ai/mockProvider';
import { renderPresentationToHtml } from '../renderer/renderHtml';
import { validatePresentation } from '../model/validator';

const FORM = { ...DEFAULT_FULL_AI_FORM, topic: '智慧工廠', purpose: '說明導入方法', audience: '製造業主管', slideCount: 6 };

describe('Mock AI Provider', () => {
  it('會依表單產生指定頁數的大綱', async () => {
    const outline = await new MockAIProvider({ delayMs: 0 }).generateOutline(FORM);
    expect(outline.title).toBe('智慧工廠');
    expect(outline.slides).toHaveLength(6);
    expect(outline.slides[0].layoutId).toBe('title');
  });

  it('不同表單會得到不同內容', async () => {
    const provider = new MockAIProvider({ delayMs: 0 });
    const first = await provider.generateOutline(FORM);
    const second = await provider.generateOutline({ ...FORM, topic: '醫療服務', purpose: '訓練新人' });
    expect(first.title).not.toBe(second.title);
    expect(first.subtitle).not.toBe(second.subtitle);
  });

  it('可以重新產生單張大綱', async () => {
    const provider = new MockAIProvider({ delayMs: 0 });
    const outline = await provider.generateOutline(FORM);
    const next = await provider.regenerateSlide(FORM, outline.slides[1], 1);
    expect(next.id).toBe(outline.slides[1].id);
    expect(next.summary).toContain('重新整理');
  });

  it('停止生成會中止工作', async () => {
    const provider = new MockAIProvider({ delayMs: 20 });
    const outline = await provider.generateOutline(FORM);
    const task = provider.generatePresentation(FORM, outline);
    setTimeout(() => provider.cancel(), 1);
    await expect(task).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('生成結果使用雙母片、唯一 ID，且通過驗證', async () => {
    const provider = new MockAIProvider({ delayMs: 0 });
    const outline = await provider.generateOutline(FORM);
    const presentation = await provider.generatePresentation(FORM, outline);
    const ids = presentation.slides.flatMap((slide) => [slide.id, ...slide.elements.map((element) => element.id)]);
    expect(presentation.slides[0].masterKind).toBe('cover');
    expect(presentation.slides.slice(1).every((slide) => slide.masterKind === 'content')).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    expect(validatePresentation(presentation).status).toBe('success');
  });

  it('講者備註與圖表會使用現有資料格式', async () => {
    const provider = new MockAIProvider({ delayMs: 0 });
    const outline = await provider.generateOutline(FORM);
    const presentation = await provider.generatePresentation(FORM, outline);
    expect(presentation.slides.every((slide) => slide.notes.length > 0)).toBe(true);
    expect(presentation.slides.some((slide) => slide.elements.some((element) => element.type === 'chart'))).toBe(true);
  });

  it('生成結果可以匯出成單檔 HTML', async () => {
    const provider = new MockAIProvider({ delayMs: 0 });
    const outline = await provider.generateOutline(FORM);
    const presentation = await provider.generatePresentation(FORM, outline);
    const html = renderPresentationToHtml(presentation);
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('智慧工廠');
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toMatch(/<link[^>]+href=/i);
  });

  it('整體失敗時會回傳可讀的繁體中文錯誤', async () => {
    const provider = new MockAIProvider({ delayMs: 0, failAll: true });
    const outline = await new MockAIProvider({ delayMs: 0 }).generateOutline(FORM);
    await expect(provider.generatePresentation(FORM, outline)).rejects.toThrow('請調整內容後再試一次');
  });
});

