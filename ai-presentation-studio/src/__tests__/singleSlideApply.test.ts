import { beforeEach, describe, expect, it } from 'vitest';
import { auditEditableSlide } from '../ai/editableAudit';
import { buildSingleSlideContext, DEFAULT_SINGLE_SLIDE_FORM, rekeySingleSlide, validateSingleSlideCandidate, validateSingleSlideForm } from '../ai/singleSlide';
import { createDemoPresentation } from '../model/demo';
import { createSlide, createTextElement } from '../model/factory';
import type { Slide } from '../model/types';
import { renderPresentationToHtml } from '../renderer/renderHtml';
import { editorStore } from '../store/editorStore';

/**
 * 這一份不再依賴 Mock AI 生成器。
 *
 * 「單頁 AI 生成」現在的入口是外部交接（下載壓縮檔 → 貼給 AI → 匯入結果），
 * 這裡改用手動搭出來的一張「假裝是外部 AI 回傳」的投影片，
 * 專心測 `buildSingleSlideContext`／`validateSingleSlideCandidate`／
 * `auditEditableSlide`／`editorStore.insertGeneratedSlide` 這些不管結果從哪來
 * 都必須正確的共用邏輯。
 */
function fixtureCandidate(): Slide {
  return createSlide({
    id: 'candidate-1',
    title: '智慧製造成長',
    masterKind: 'content',
    elements: [
      createTextElement({ id: 'cand-title', text: '智慧製造成長', x: 100, y: 100, width: 800, height: 100 }),
      createTextElement({ id: 'cand-body', text: '自動化讓交期縮短並降低錯誤', x: 100, y: 260, width: 800, height: 200 }),
    ],
  });
}

function setupContext(selectedIndexes = [1]) {
  const presentation = createDemoPresentation();
  const selectedIds = selectedIndexes.map((index) => presentation.slides[index].id);
  return { presentation, context: buildSingleSlideContext(presentation, selectedIds.at(-1)!, selectedIds) };
}

describe('AI 生成單頁：共用邏輯', () => {
  beforeEach(() => editorStore.replacePresentation(createDemoPresentation(), { resetHistory: true }));

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

  it('多選時插到最後一張選取頁後面', () => {
    editorStore.selectSlide(editorStore.getState().presentation.slides[1].id);
    editorStore.selectSlide(editorStore.getState().presentation.slides[3].id, 'toggle');
    const state = editorStore.getState();
    const context = buildSingleSlideContext(state.presentation, state.currentSlideId, state.selectedSlideIds);
    const slide = rekeySingleSlide(fixtureCandidate());
    expect(editorStore.insertGeneratedSlide(slide, context)).toBe(true);
    expect(editorStore.getState().presentation.slides[4].title).toBe('智慧製造成長');
  });

  it('插入前不會改動簡報，加入後可一次復原與重作', () => {
    const state = editorStore.getState();
    const context = buildSingleSlideContext(state.presentation, state.currentSlideId, state.selectedSlideIds);
    const count = state.presentation.slides.length;
    const slide = rekeySingleSlide(fixtureCandidate());
    expect(editorStore.getState().presentation.slides).toHaveLength(count);
    editorStore.insertGeneratedSlide(slide, context);
    expect(editorStore.getState().presentation.slides).toHaveLength(count + 1);
    editorStore.undo();
    expect(editorStore.getState().presentation.slides).toHaveLength(count);
    editorStore.redo();
    expect(editorStore.getState().presentation.slides).toHaveLength(count + 1);
  });

  it('外部 AI 回傳的候選投影片要通過可編輯查核', () => {
    const { context } = setupContext();
    const slide = rekeySingleSlide(fixtureCandidate());
    const ids = slide.elements.map((element) => element.id);
    expect(slide.masterKind).toBe('content');
    expect(new Set(ids).size).toBe(ids.length);
    expect(validateSingleSlideCandidate(slide, context).ok).toBe(true);
    const audit = auditEditableSlide(slide, context.width, context.height);
    expect(audit.issues).toEqual([]);
    expect(audit.nativeCount).toBe(slide.elements.length);
    expect(audit.svgCount).toBe(0);
    expect(audit.imageCount).toBe(0);
  });

  it('元素超出畫布或互相重疊時要擋下來', () => {
    const { context } = setupContext();
    const outOfBounds = createSlide({
      id: 'bad-1',
      elements: [createTextElement({ id: 'bad-t', text: '超出去了', x: context.width - 10, y: 0, width: 400, height: 100 })],
    });
    expect(validateSingleSlideCandidate(outOfBounds, context).ok).toBe(false);

    const overlapping = createSlide({
      id: 'bad-2',
      elements: [
        createTextElement({ id: 'ov-a', text: 'A', x: 0, y: 0, width: 200, height: 100 }),
        createTextElement({ id: 'ov-b', text: 'B', x: 50, y: 20, width: 200, height: 100 }),
      ],
    });
    expect(validateSingleSlideCandidate(overlapping, context).ok).toBe(false);
  });

  it('加入後可用單檔 HTML 顯示生成頁', () => {
    const state = editorStore.getState();
    const context = buildSingleSlideContext(state.presentation, state.currentSlideId, state.selectedSlideIds);
    const slide = rekeySingleSlide(fixtureCandidate());
    editorStore.insertGeneratedSlide(slide, context);
    const html = renderPresentationToHtml(editorStore.getState().presentation);
    expect(html).toContain('智慧製造成長');
    expect(html).not.toMatch(/<script[^>]+src=/i);
  });
});
