import { describe, expect, it } from 'vitest';
import { createDemoPresentation } from '../model/demo';
import {
  addElementToSlide,
  allocateTaskId,
  cloneSlide,
  createAiComponentElement,
  createRectElement,
  createSlide,
  createTextElement,
  syncAiTasks,
} from '../model/factory';
import { parsePresentationJson, validatePresentation } from '../model/validator';
import { PRESENTATION_PROTOCOL } from '../model/types';

describe('Presentation Specification', () => {
  it('示範簡報符合規格：五頁、四個 AI 任務、協定正確', () => {
    const p = createDemoPresentation();
    expect(p.protocol).toBe(PRESENTATION_PROTOCOL);
    expect(p.slides).toHaveLength(5);
    expect(p.aiTasks).toHaveLength(4);
    expect(p.settings.width).toBe(1920);
    expect(p.settings.height).toBe(1080);
    expect(p.metadata.title).toBe('2026 AI 科技趨勢');
    expect(p.masters?.cover).toMatchObject({ id: 'master-cover', title: '封面母片', elements: [] });
    expect(p.masters?.content).toMatchObject({ id: 'master-content', title: '內容母片', elements: [] });
    expect(p.slides[0].masterKind).toBeUndefined();
  });

  it('TASK-001 指向 slide-02 的 ai-chart-001', () => {
    const p = createDemoPresentation();
    const task = p.aiTasks.find((t) => t.id === 'TASK-001');
    expect(task).toBeDefined();
    expect(task?.target.slideId).toBe('slide-02');
    expect(task?.target.elementId).toBe('ai-chart-001');
    expect(task?.status).toBe('pending');
    expect(task?.outputFormat).toBe('svg');
  });

  it('所有 ID 都是穩定且唯一的，不使用陣列索引', () => {
    const p = createDemoPresentation();
    const slideIds = p.slides.map((s) => s.id);
    const elementIds = p.slides.flatMap((s) => s.elements.map((e) => e.id));
    expect(new Set(slideIds).size).toBe(slideIds.length);
    expect(new Set(elementIds).size).toBe(elementIds.length);
    for (const id of [...slideIds, ...elementIds]) {
      expect(id).not.toMatch(/^\d+$/);
    }
  });

  it('syncAiTasks 會依 AI 元件重新推導任務清單並帶上版面資訊', () => {
    const p = createDemoPresentation();
    const slide = p.slides[1];
    const el = createAiComponentElement({
      id: 'ai-extra-001',
      taskId: allocateTaskId(p),
      kind: 'table',
      prompt: '製作比較表',
      x: 100,
      y: 100,
      width: 400,
      height: 300,
    });
    slide.elements.push(el);
    const synced = syncAiTasks(p);
    expect(synced.aiTasks).toHaveLength(5);
    const task = synced.aiTasks.find((t) => t.target.elementId === 'ai-extra-001');
    expect(task?.id).toBe('TASK-005');
    expect(task?.layoutHint).toEqual({
      slideIndex: 2,
      x: 100,
      y: 100,
      width: 400,
      height: 300,
      slideWidth: 1920,
      slideHeight: 1080,
    });
  });

  it('複製投影片會配發新的元素 ID 與任務 ID', () => {
    const p = createDemoPresentation();
    const copy = cloneSlide(p.slides[1], p);
    expect(copy.id).not.toBe(p.slides[1].id);
    const ai = copy.elements.find((e) => e.type === 'ai_component');
    expect(ai?.id).not.toBe('ai-chart-001');
    expect(ai && ai.type === 'ai_component' ? ai.taskId : '').not.toBe('TASK-001');
  });
});

describe('Validator', () => {
  it('示範簡報通過驗證', () => {
    const report = validatePresentation(createDemoPresentation());
    expect(report.status).toBe('success');
    expect(report.slides).toBe(5);
    expect(report.aiTasks).toEqual({
      total: 4,
      pending: 4,
      processing: 0,
      completed: 0,
      failed: 0,
    });
    expect(report.validation).toEqual({
      outOfBounds: 0,
      missingTargets: 0,
      duplicateIds: 0,
      invalidSize: 0,
      orphanTasks: 0,
    });
  });

  it('偵測重複的元素 ID', () => {
    const p = createDemoPresentation();
    p.slides[0].elements.push(createTextElement({ id: 'el-cover-title', text: '重複' }));
    const report = validatePresentation(p);
    expect(report.status).toBe('error');
    expect(report.validation.duplicateIds).toBe(1);
    expect(report.issues.some((i) => i.code === 'DUPLICATE_ELEMENT_ID')).toBe(true);
  });

  it('偵測超出投影片範圍的元素', () => {
    const p = createDemoPresentation();
    p.slides[0].elements.push(createTextElement({ id: 'el-out', x: 1900, y: 1000, width: 400, height: 200 }));
    const report = validatePresentation(p);
    expect(report.validation.outOfBounds).toBe(1);
    expect(report.status).toBe('warning');
  });

  it('旋轉後的顯示範圍超出投影片時會警告', () => {
    const p = createDemoPresentation();
    p.slides[0].elements.push(
      createTextElement({
        id: 'el-rotated-out',
        x: 700,
        y: 100,
        width: 1200,
        height: 100,
        rotation: 90,
      }),
    );
    const report = validatePresentation(p);

    expect(report.validation.outOfBounds).toBe(1);
    expect(report.issues.some((issue) => issue.elementId === 'el-rotated-out')).toBe(true);
  });

  it('偵測寬高不合法的元素與簡報', () => {
    const p = createDemoPresentation();
    p.settings.width = 0;
    p.slides[0].elements.push(createTextElement({ id: 'el-zero', width: 0, height: -5 }));
    const report = validatePresentation(p);
    expect(report.validation.invalidSize).toBeGreaterThanOrEqual(2);
    expect(report.status).toBe('error');
  });

  it('偵測指向不存在元素的 AI 任務', () => {
    const p = createDemoPresentation();
    p.aiTasks[0].target.elementId = 'not-exists';
    const report = validatePresentation(p);
    expect(report.validation.missingTargets).toBeGreaterThan(0);
    expect(report.issues.some((i) => i.code === 'TASK_TARGET_ELEMENT_MISSING')).toBe(true);
  });

  it('拒絕協定錯誤或格式錯誤的 JSON，且不執行其中內容', () => {
    expect(parsePresentationJson('{ not json').ok).toBe(false);
    expect(parsePresentationJson('{ not json').errors[0]).toContain('JSON 格式錯誤');

    const wrong = parsePresentationJson(JSON.stringify({ protocol: 'other/v1', slides: [] }));
    expect(wrong.ok).toBe(false);
    expect(wrong.errors.join()).toContain('protocol');

    const good = parsePresentationJson(JSON.stringify(createDemoPresentation()));
    expect(good.ok).toBe(true);
    expect(good.presentation?.slides).toHaveLength(5);
  });

  it('新增的元素會疊在既有元素的最上層', () => {
    let slide = createSlide({ title: '層次測試' });

    slide = addElementToSlide(slide, createRectElement({ id: 'first' }));
    slide = addElementToSlide(slide, createTextElement({ id: 'second' }));
    slide = addElementToSlide(slide, createRectElement({ id: 'third' }));

    expect(slide.elements.map((el) => el.z)).toEqual([1, 2, 3]);
  });

  it('加到已有高層次元素的投影片時，仍然疊在最上層', () => {
    let slide = createSlide({ title: '層次測試' });
    slide = addElementToSlide(slide, createRectElement({ id: 'background', z: 1 }));
    slide = addElementToSlide(slide, createTextElement({ id: 'title', z: 9 }));

    slide = addElementToSlide(slide, createRectElement({ id: 'new' }));

    expect(slide.elements.find((el) => el.id === 'new')?.z).toBe(10);
  });

  it('明確指定的 z 會被保留，不會被覆蓋', () => {
    let slide = createSlide({ title: '層次測試' });
    slide = addElementToSlide(slide, createRectElement({ id: 'keep-me', z: 42 }));

    expect(slide.elements[0].z).toBe(42);
  });
});
