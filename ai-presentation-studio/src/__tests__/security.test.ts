import { describe, expect, it } from 'vitest';
import { sanitizeAiOutput, sanitizeHtml, sanitizeImageSrc, sanitizeSvg } from '../model/sanitize';
import { applyPatch } from '../model/patch';
import { createDemoPresentation } from '../model/demo';
import { renderPresentationToHtml } from '../renderer/renderHtml';
import { PATCH_PROTOCOL } from '../model/types';
import { buildMockOutput } from '../handoff/mockAi';

describe('匯入內容的安全處理', () => {
  it('移除 SVG 中的 <script>', () => {
    const result = sanitizeSvg('<svg><script>alert(1)</script><rect width="10"/></svg>');
    expect(result.content).not.toContain('script');
    expect(result.content).toContain('<rect');
    expect(result.removed).toContain('<script>');
  });

  it('移除 on* 事件屬性', () => {
    const result = sanitizeSvg('<svg><rect onerror="alert(1)" onclick="x()" width="10"/></svg>');
    expect(result.content).not.toMatch(/onerror|onclick/i);
    expect(result.content).toContain('width="10"');
  });

  it('移除 javascript: 連結（含編碼與控制字元繞過）', () => {
    expect(sanitizeSvg('<svg><a href="javascript:alert(1)"></a></svg>').content).not.toContain(
      'javascript:',
    );
    const encoded = sanitizeHtml('<div><span href="java&#115;cript:alert(1)">x</span></div>');
    expect(encoded.content).not.toContain('cript:alert');
    const spaced = sanitizeHtml('<div><span href="java\tscript:alert(1)">x</span></div>');
    expect(spaced.content).not.toContain('script:alert');
  });

  it('移除 iframe、object、foreignObject 等危險標籤', () => {
    const result = sanitizeHtml(
      '<div><iframe src="http://evil"></iframe><object data="x"></object><foreignObject><script>x</script></foreignObject><p>安全</p></div>',
    );
    expect(result.content).not.toMatch(/iframe|object|foreignObject/i);
    expect(result.content).toContain('安全');
  });

  it('拒絕不安全的圖片來源', () => {
    expect(sanitizeImageSrc('javascript:alert(1)')).toBe('');
    expect(sanitizeImageSrc('data:text/html,<script>alert(1)</script>')).toBe('');
    expect(sanitizeImageSrc('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
    expect(sanitizeImageSrc('https://example.com/a.png')).toBe('https://example.com/a.png');
  });

  it('sanitizeAiOutput 依格式選擇正確的清理器', () => {
    expect(sanitizeAiOutput('svg', '<svg><script>x</script></svg>').content).not.toContain('script');
    expect(sanitizeAiOutput('text', '<script>x</script>').content).toBe('<script>x</script>');
  });

  it('惡意 AI 結果不會進入簡報，也不會出現在匯出的 HTML', () => {
    const p = createDemoPresentation();
    const { presentation, summary } = applyPatch(p, {
      protocol: PATCH_PROTOCOL,
      operations: [
        {
          operation: 'replace_ai_output',
          taskId: 'TASK-001',
          targetElementId: 'ai-chart-001',
          output: {
            type: 'svg',
            content:
              '<svg viewBox="0 0 100 100"><script>fetch("http://evil")</script><rect width="50" height="50" onload="alert(1)"/></svg>',
          },
        },
      ],
    });

    expect(summary.applied).toBe(1);
    expect(summary.sanitized.length).toBeGreaterThan(0);

    const el = presentation.slides[1].elements.find((e) => e.id === 'ai-chart-001');
    const content = el && el.type === 'ai_component' ? (el.result?.content ?? '') : '';
    expect(content).not.toContain('<script');
    expect(content).not.toMatch(/onload/i);
    expect(content).toContain('<rect');

    const html = renderPresentationToHtml(presentation);
    expect(html).not.toContain('fetch("http://evil")');
    expect(html).not.toMatch(/onload=/i);
  });
});

describe('SVG 結構完整性', () => {
  it('保留自封閉標籤，避免後續節點被吃進 <rect>', () => {
    const svg =
      '<svg viewBox="0 0 100 100"><rect x="0" y="0" width="100" height="50" fill="#fff" /><text x="5" y="20">標題</text><circle cx="5" cy="5" r="2"/></svg>';
    const out = sanitizeSvg(svg).content;
    expect(out).toContain('<rect x="0" y="0" width="100" height="50" fill="#fff" />');
    expect(out).toContain('<circle cx="5" cy="5" r="2" />');
    expect(out).toContain('<text x="5" y="20">標題</text>');
    expect(out.indexOf('<text')).toBeGreaterThan(out.indexOf('<rect'));
  });

  it('外部 AI 若省略結尾斜線也會自動補上', () => {
    const out = sanitizeSvg('<svg viewBox="0 0 10 10"><rect width="10" height="10"><text>x</text></svg>').content;
    expect(out).toContain('<rect width="10" height="10" />');
  });

  it('模擬 AI 產生的 SVG 通過清理後結構不變', () => {
    const p = createDemoPresentation();
    const el = p.slides[1].elements.find((e) => e.id === 'ai-chart-001');
    if (!el || el.type !== 'ai_component') throw new Error('找不到 AI 元件');
    const { content } = sanitizeSvg(buildMockOutput(el).content);
    const rects = content.match(/<rect[^>]*\/>/g) ?? [];
    expect(rects.length).toBeGreaterThan(3);
    expect(content).not.toMatch(/<rect[^>]*[^/]>/);
    expect((content.match(/<text/g) ?? []).length).toBeGreaterThan(5);
  });
});
