import { describe, expect, it } from 'vitest';
import { createDemoPresentation } from '../model/demo';
import { renderPresentationToHtml } from '../renderer/renderHtml';
import { applyPatch } from '../model/patch';
import { buildMockPatch } from '../handoff/mockAi';

describe('HTML Renderer', () => {
  const presentation = createDemoPresentation();
  const html = renderPresentationToHtml(presentation);

  it('產生完整的 HTML 文件', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<html lang="zh-Hant">');
    expect(html).toContain('<title>2026 AI 科技趨勢</title>');
    expect(html.trimEnd().endsWith('</html>')).toBe(true);
  });

  it('每一頁投影片都被輸出，且第一頁為 active', () => {
    for (const slide of presentation.slides) {
      expect(html).toContain(`id="aps-slide-${slide.id}"`);
    }
    expect(html.match(/class="aps-slide is-active"/g)).toHaveLength(1);
  });

  it('是自足檔案：不依賴 CDN 或任何遠端資源', () => {
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toMatch(/<link[^>]+href="https?:/i);
    expect(html).not.toMatch(/@import\s+url\(https?:/i);
    expect(html).not.toContain('cdn.');
  });

  it('內建換頁、鍵盤與全螢幕控制', () => {
    expect(html).toContain('上一頁');
    expect(html).toContain('下一頁');
    expect(html).toContain('全螢幕');
    expect(html).toContain("case 'ArrowRight'");
    expect(html).toContain("case 'ArrowLeft'");
    expect(html).toContain('requestFullscreen');
    expect(html).toContain('exitFullscreen');
    expect(html).toContain('第 1 / 5 頁');
    expect(html).toContain("'第 ' + (index + 1) + ' / ' + total + ' 頁'");
  });

  it('文字內容有正確跳脫，避免注入', () => {
    const p = createDemoPresentation();
    const el = p.slides[0].elements.find((e) => e.type === 'text');
    if (el && el.type === 'text') el.text = '<img src=x onerror=alert(1)>';
    const out = renderPresentationToHtml(p);
    expect(out).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(out).not.toContain('<img src=x');
  });

  it('待處理的 AI 元件輸出佔位區塊；完成後輸出實際內容', () => {
    expect(html).toContain('等待 AI 處理');
    expect(html).toContain('aps-ai-pending');

    const { presentation: done } = applyPatch(presentation, buildMockPatch(presentation));
    const doneHtml = renderPresentationToHtml(done);
    expect(doneHtml).toContain('aps-ai-completed');
    expect(doneHtml).not.toContain('等待 AI 處理');
    expect(doneHtml).toContain('<svg');
    expect(doneHtml).toContain('模擬資料');
  });

  it('AI 元件輸出在正確的位置與大小', () => {
    const { presentation: done } = applyPatch(presentation, buildMockPatch(presentation));
    const doneHtml = renderPresentationToHtml(done);
    const el = done.slides[1].elements.find((e) => e.id === 'ai-chart-001');
    expect(el).toBeDefined();
    expect(doneHtml).toContain(`left:${el!.x}px;top:${el!.y}px;width:${el!.width}px;height:${el!.height}px`);
  });

  it('Renderer 不依賴 React', async () => {
    const fs = await import('node:fs/promises');
    const source = await fs.readFile('src/renderer/renderHtml.ts', 'utf-8');
    const elementSource = await fs.readFile('src/renderer/renderElement.ts', 'utf-8');
    expect(source).not.toMatch(/from 'react'/);
    expect(elementSource).not.toMatch(/from 'react'/);
  });
});
