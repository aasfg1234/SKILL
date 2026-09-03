import JSZip from 'jszip';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DEFAULT_FULL_AI_FORM } from '../ai/form';
import {
  buildFullOutlinePackage,
  buildFullPresentationPackage,
  buildSingleSlidePackage,
  FULL_OUTLINE_PROTOCOL,
  parseHandoffJson,
} from '../ai/handoffPackage';
import { buildSingleSlideContext, DEFAULT_SINGLE_SLIDE_FORM } from '../ai/singleSlide';
import type { PresentationOutline } from '../ai/types';
import { ExternalFullAiDialog } from '../components/ExternalFullAiDialog';
import { ExternalSingleSlideAiDialog } from '../components/ExternalSingleSlideAiDialog';
import { createDemoPresentation } from '../model/demo';
import { editorStore } from '../store/editorStore';

async function filesOf(blob: Blob): Promise<Record<string, string>> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const entries = await Promise.all(Object.entries(zip.files).filter(([, entry]) => !entry.dir).map(async ([name, entry]) => [name, await entry.async('string')] as const));
  return Object.fromEntries(entries);
}

describe('外部 AI 壓縮檔交接', () => {
  it('全生成入口只顯示下載壓縮檔，不直接生成', () => {
    editorStore.replacePresentation(createDemoPresentation(), { resetHistory: true });
    const html = renderToStaticMarkup(<ExternalFullAiDialog />);
    expect(html).toContain('下載大綱 AI 壓縮檔');
    expect(html).toContain('編輯器不會直接產生內容');
    expect(html).not.toContain('Mock AI');
  });

  it('單頁入口只顯示下載壓縮檔，不直接生成', () => {
    editorStore.replacePresentation(createDemoPresentation(), { resetHistory: true });
    const html = renderToStaticMarkup(<ExternalSingleSlideAiDialog />);
    expect(html).toContain('下載單頁 AI 壓縮檔');
    expect(html).toContain('外部 AI');
    expect(html).not.toContain('生成預覽</button>');
  });

  it('大綱壓縮檔包含設定、原簡報與完整指令', async () => {
    const source = createDemoPresentation();
    const form = { ...DEFAULT_FULL_AI_FORM, topic: '低碳工廠', purpose: '說明節能方案', audience: '廠長', slideCount: 6 };
    const pack = await buildFullOutlinePackage(form, source);
    const files = await filesOf(pack.blob);
    expect(Object.keys(files).sort()).toEqual([
      'full-ai-outline/AI-INSTRUCTIONS.md',
      'full-ai-outline/output/README.md',
      'full-ai-outline/presentation.json',
      'full-ai-outline/request.json',
    ]);
    expect(JSON.parse(files['full-ai-outline/request.json']).form.topic).toBe('低碳工廠');
    expect(files['full-ai-outline/AI-INSTRUCTIONS.md']).toContain('不得輸出整頁圖片');
    expect(files['full-ai-outline/AI-INSTRUCTIONS.md']).toContain('full-ai-outline-result.json');
  });

  it('完整簡報壓縮檔包含使用者確認的大綱', async () => {
    const source = createDemoPresentation();
    const outline: PresentationOutline = { title: '低碳工廠', subtitle: '節能方案', slides: [{ id: 'o-1', title: '封面', summary: '開場', layoutId: 'title', visualSuggestion: '簡潔', notesSummary: '說明目的', locked: true }] };
    const pack = await buildFullPresentationPackage({ ...DEFAULT_FULL_AI_FORM, topic: '低碳工廠' }, outline, source);
    const files = await filesOf(pack.blob);
    expect(JSON.parse(files['full-ai-presentation/request.json']).outline.slides[0].locked).toBe(true);
    expect(files['full-ai-presentation/AI-INSTRUCTIONS.md']).toContain('表格必須使用 table 元件');
  });

  it('單頁壓縮檔包含插入位置、前後頁與母片', async () => {
    const source = createDemoPresentation();
    const context = buildSingleSlideContext(source, source.slides[1].id, [source.slides[1].id]);
    const pack = await buildSingleSlidePackage({ ...DEFAULT_SINGLE_SLIDE_FORM, topic: '市場比較', keyMessage: '比較方案差異', pageType: 'comparison' }, context, source);
    const files = await filesOf(pack.blob);
    const request = JSON.parse(files['single-slide-ai/request.json']);
    expect(request.context.insertAfterSlideId).toBe(source.slides[1].id);
    expect(request.context.previousTitle).toBe(source.slides[1].title);
    expect(request.context.contentMaster.masterKind).toBe('content');
    expect(files['single-slide-ai/AI-INSTRUCTIONS.md']).toContain('只產生一個符合目前 Slide 格式');
  });

  it('匯入時拒絕錯誤任務編號', () => {
    const text = JSON.stringify({ protocol: FULL_OUTLINE_PROTOCOL, requestId: 'wrong' });
    expect(() => parseHandoffJson(text, FULL_OUTLINE_PROTOCOL, 'right')).toThrow('不屬於這次任務');
  });
});
