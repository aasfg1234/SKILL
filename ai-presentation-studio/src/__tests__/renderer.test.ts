import { describe, expect, it } from 'vitest';
import { createDemoPresentation } from '../model/demo';
import { renderPresentationToHtml } from '../renderer/renderHtml';
import { applyPatch } from '../model/patch';
import { buildMockPatch } from '../handoff/mockAi';
import { escapeHtml } from '../model/sanitize';
import { createChartElement, createTableElement } from '../model/factory';
import { mergeCells } from '../model/table';

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
    expect(html).toContain("'ArrowRight'");
    expect(html).toContain("'ArrowLeft'");
    // 上下鍵與點畫面換頁
    expect(html).toContain("'ArrowDown'");
    expect(html).toContain("'ArrowUp'");
    expect(html).toContain("viewport.addEventListener('click'");
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

  it('把每一頁的備註一起匯出，講者檢視才有東西可看', () => {
    const withNotes = presentation.slides.filter((slide) => slide.notes.trim() !== '');

    expect(withNotes.length).toBeGreaterThan(0);
    for (const slide of withNotes) {
      expect(html).toContain(`data-notes="${escapeHtml(slide.notes)}"`);
    }
  });

  it('開啟隱藏設定後，未完成的 AI 元件不會出現在匯出的簡報裡', () => {
    const hidden = createDemoPresentation();
    hidden.settings.hideIncompleteAi = true;
    const out = renderPresentationToHtml(hidden);

    expect(out).not.toContain('等待 AI 處理');
    expect(out).not.toContain('aps-ai-pending');
    // 一般元素不受影響
    expect(out).toContain('2026 AI 科技趨勢');
    // 備註仍會匯出，講者檢視才有東西可看（觀眾看不到）
    expect(out).toContain('data-notes=');
  });

  it('圖表與合併的表格都能正確匯出', () => {
    const p = createDemoPresentation();
    p.slides[0].elements.push(
      createChartElement({ id: 'c1', labels: ['甲', '乙'], values: [3, 7], z: 90 }),
    );
    p.slides[0].elements.push(
      mergeCells(
        createTableElement({ id: 't1', rows: 2, columns: 2, z: 91 }),
        { row: 0, col: 0 },
        { row: 0, col: 1 },
      ),
    );
    const out = renderPresentationToHtml(p);

    expect(out).toContain('aps-chart');
    expect(out).toContain('<svg');
    expect(out).toContain('甲');
    // 合併之後只剩三格，而且第一格橫跨兩欄
    expect(out).toContain('grid-column:1 / span 2');
    expect((out.match(/grid-column:/g) ?? []).length).toBe(3);
  });

  it('匯出的 HTML 內建講者檢視', () => {
    expect(html).toContain('aps-presenter');
    expect(html).toContain('講者檢視');
  });

  it('匯出的 HTML 以拉丁字型開頭，換系統開啟才不會跑版', () => {
    // 中文字在各家字型都是等寬的；會讓版面跑掉的是英文與數字。
    // 只要英文固定成各系統都有的 Arial，整行寬度就固定。
    const fontLine = html.split('\n').find((line) => line.includes('font-family:'));

    expect(fontLine).toBeDefined();
    expect(fontLine).toContain('Arial');
    expect(fontLine!.indexOf('Arial')).toBeLessThan(fontLine!.indexOf('Microsoft JhengHei'));
  });

  it('Renderer 不依賴 React', async () => {
    const fs = await import('node:fs/promises');
    const source = await fs.readFile('src/renderer/renderHtml.ts', 'utf-8');
    const elementSource = await fs.readFile('src/renderer/renderElement.ts', 'utf-8');
    expect(source).not.toMatch(/from 'react'/);
    expect(elementSource).not.toMatch(/from 'react'/);
  });
});
