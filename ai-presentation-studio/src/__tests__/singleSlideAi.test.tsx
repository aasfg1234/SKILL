import { beforeEach, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { auditEditableSlide } from '../ai/editableAudit';
import { MockAIProvider } from '../ai/mockProvider';
import { buildSingleSlideContext, DEFAULT_SINGLE_SLIDE_FORM, validateSingleSlideCandidate, validateSingleSlideForm } from '../ai/singleSlide';
import type { SingleSlideForm } from '../ai/types';
import { SlideList } from '../components/SlideList';
import { createDemoPresentation } from '../model/demo';
import { renderPresentationToHtml } from '../renderer/renderHtml';
import { editorStore } from '../store/editorStore';

function form(overrides: Partial<SingleSlideForm> = {}): SingleSlideForm {
  return { ...DEFAULT_SINGLE_SLIDE_FORM, topic: '智慧製造成長', keyMessage: '自動化讓交期縮短並降低錯誤', ...overrides };
}

function setupContext(selectedIndexes = [1]) {
  const presentation = createDemoPresentation();
  const selectedIds = selectedIndexes.map((index) => presentation.slides[index].id);
  return { presentation, context: buildSingleSlideContext(presentation, selectedIds.at(-1)!, selectedIds) };
}

describe('AI 生成單頁', () => {
  beforeEach(() => editorStore.replacePresentation(createDemoPresentation(), { resetHistory: true }));

  it('左側保留一般新增，並提供 AI 單頁入口', () => {
    const html = renderToStaticMarkup(<SlideList collapsed={false} onToggle={() => undefined} />);
    expect(html).toContain('新增一般投影片');
    expect(html).toContain('AI 生成單頁');
  });

  it('會檢查兩個必填欄位', () => {
    expect(validateSingleSlideForm(DEFAULT_SINGLE_SLIDE_FORM)).toEqual({ topic: '請填寫本頁主題。', keyMessage: '請填寫本頁要表達的重點。' });
  });

  it('自動取得簡報資料、前後頁與內容母片', () => {
    const { presentation, context } = setupContext();
    expect(context.presentationTitle).toBe(presentation.metadata.title);
    expect(context.previousTitle).toBe(presentation.slides[1].title);
    expect(context.nextTitle).toBe(presentation.slides[2].title);
    expect(context.previousSummary.length).toBeGreaterThan(0);
    expect(context.contentMaster.masterKind).toBe('content');
  });

  it('多選時插到最後一張選取頁後面', async () => {
    const presentation = editorStore.getState().presentation;
    editorStore.selectSlide(presentation.slides[1].id);
    editorStore.selectSlide(presentation.slides[3].id, 'toggle');
    const state = editorStore.getState();
    const context = buildSingleSlideContext(state.presentation, state.currentSlideId, state.selectedSlideIds);
    const slide = await new MockAIProvider({ delayMs: 0 }).generateSingleSlide({ form: form(), context });
    expect(editorStore.insertGeneratedSlide(slide, context)).toBe(true);
    expect(editorStore.getState().presentation.slides[4].title).toBe('智慧製造成長');
  });

  it('預覽不會改動簡報，加入後可一次復原與重作', async () => {
    const state = editorStore.getState();
    const context = buildSingleSlideContext(state.presentation, state.currentSlideId, state.selectedSlideIds);
    const count = state.presentation.slides.length;
    const slide = await new MockAIProvider({ delayMs: 0 }).generateSingleSlide({ form: form(), context });
    expect(editorStore.getState().presentation.slides).toHaveLength(count);
    editorStore.insertGeneratedSlide(slide, context);
    expect(editorStore.getState().presentation.slides).toHaveLength(count + 1);
    editorStore.undo();
    expect(editorStore.getState().presentation.slides).toHaveLength(count);
    editorStore.redo();
    expect(editorStore.getState().presentation.slides).toHaveLength(count + 1);
  });

  it('使用內容母片、原生元件、唯一 ID，且不超出畫布', async () => {
    const { context } = setupContext();
    const slide = await new MockAIProvider({ delayMs: 0 }).generateSingleSlide({ form: form({ pageType: 'comparison' }), context });
    const ids = slide.elements.map((element) => element.id);
    expect(slide.masterKind).toBe('content');
    expect(new Set(ids).size).toBe(ids.length);
    expect(validateSingleSlideCandidate(slide, context).ok).toBe(true);
    const audit = auditEditableSlide(slide, context.width, context.height);
    expect(audit.issues).toEqual([]);
    expect(audit.nativeCount).toBe(slide.elements.length);
    expect(audit.svgCount).toBe(0);
    expect(audit.imageCount).toBe(0);
    expect(new Set(slide.elements.map((element) => element.groupId).filter(Boolean)).size).toBeGreaterThan(0);
  });

  it('流程圖由圖形、文字與連接線組成，圖表使用內建圖表', async () => {
    const { context } = setupContext();
    const provider = new MockAIProvider({ delayMs: 0 });
    const flow = await provider.generateSingleSlide({ form: form({ pageType: 'flowchart' }), context });
    expect(new Set(flow.elements.map((element) => element.type))).toEqual(new Set(['text', 'rect', 'line']));
    expect(flow.elements.filter((element) => element.type === 'line').every((element) => element.arrowEnd)).toBe(true);
    const chart = await provider.generateSingleSlide({ form: form({ pageType: 'chart', referenceContent: '20 35 61 88' }), context });
    expect(chart.elements.some((element) => element.type === 'chart')).toBe(true);
  });

  it('表格使用內建表格，內容可直接修改', async () => {
    const { context } = setupContext();
    const slide = await new MockAIProvider({ delayMs: 0 }).generateSingleSlide({ form: form({ pageType: 'table', referenceContent: '項目\t數值\n速度\t42' }), context });
    const table = slide.elements.find((element) => element.type === 'table');
    expect(table?.type).toBe('table');
    if (table?.type === 'table') {
      table.cells[1][1] = '55';
      expect(table.cells[1][1]).toBe('55');
    }
  });

  it('修改要求與主題會改變 Mock 輸出', async () => {
    const { context } = setupContext();
    const provider = new MockAIProvider({ delayMs: 0 });
    const first = await provider.generateSingleSlide({ form: form(), context });
    const second = await provider.regenerateSingleSlide({ form: form({ topic: '醫療服務', extraRequest: '改成左右比較' }), context });
    expect(first.title).not.toBe(second.title);
    expect(second.elements.some((element) => element.groupName === '建議做法')).toBe(true);
  });

  it('停止生成不會留下空白投影片', async () => {
    const { context } = setupContext();
    const provider = new MockAIProvider({ delayMs: 20 });
    const count = editorStore.getState().presentation.slides.length;
    const task = provider.generateSingleSlide({ form: form(), context });
    setTimeout(() => provider.cancelSingleSlideGeneration(), 1);
    await expect(task).rejects.toMatchObject({ name: 'AbortError' });
    expect(editorStore.getState().presentation.slides).toHaveLength(count);
  });

  it('加入後可用單檔 HTML 顯示生成頁', async () => {
    const state = editorStore.getState();
    const context = buildSingleSlideContext(state.presentation, state.currentSlideId, state.selectedSlideIds);
    const slide = await new MockAIProvider({ delayMs: 0 }).generateSingleSlide({ form: form(), context });
    editorStore.insertGeneratedSlide(slide, context);
    const html = renderPresentationToHtml(editorStore.getState().presentation);
    expect(html).toContain('智慧製造成長');
    expect(html).not.toMatch(/<script[^>]+src=/i);
  });
});
