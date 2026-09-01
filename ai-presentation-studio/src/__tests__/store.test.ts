import { beforeEach, describe, expect, it } from 'vitest';
import { editorStore, STORAGE_KEY } from '../store/editorStore';
import { createRectElement, createTextElement } from '../model/factory';
import { createDemoPresentation } from '../model/demo';

/** 這些測試在 jsdom 環境執行，驗證編輯操作、復原重做與本機儲存。 */

function reset() {
  editorStore.replacePresentation(createDemoPresentation(), { resetHistory: true });
  editorStore.selectSlide('slide-01');
}

describe('編輯器 Store', () => {
  beforeEach(reset);

  it('新增、複製、刪除、移動投影片', () => {
    const before = editorStore.getState().presentation.slides.length;

    editorStore.addSlide('slide-01');
    expect(editorStore.getState().presentation.slides).toHaveLength(before + 1);
    expect(editorStore.getState().presentation.slides[1].id).not.toBe('slide-02');

    editorStore.duplicateSlide('slide-01');
    expect(editorStore.getState().presentation.slides).toHaveLength(before + 2);

    const target = editorStore.getState().presentation.slides[1].id;
    editorStore.deleteSlide(target);
    expect(editorStore.getState().presentation.slides).toHaveLength(before + 1);

    editorStore.moveSlide('slide-01', 1);
    expect(editorStore.getState().presentation.slides[1].id).toBe('slide-01');
  });

  it('至少保留一張投影片', () => {
    editorStore.replacePresentation(
      { ...createDemoPresentation(), slides: [createDemoPresentation().slides[0]] },
      { resetHistory: true },
    );
    editorStore.deleteSlide('slide-01');
    expect(editorStore.getState().presentation.slides).toHaveLength(1);
  });

  it('新增元素、移動元素、刪除元素，並支援復原與重做', () => {
    const el = createTextElement({ id: 'el-test-1', text: '測試', x: 100, y: 100 });
    editorStore.addElement(el, 'slide-01');
    const find = () =>
      editorStore
        .getState()
        .presentation.slides.find((s) => s.id === 'slide-01')
        ?.elements.find((e) => e.id === 'el-test-1');
    expect(find()).toBeDefined();

    editorStore.select(['el-test-1']);
    editorStore.nudge(10, 20);
    expect(find()?.x).toBe(110);
    expect(find()?.y).toBe(120);

    editorStore.undo();
    expect(find()?.x).toBe(100);

    editorStore.redo();
    expect(find()?.x).toBe(110);

    editorStore.deleteSelected();
    expect(find()).toBeUndefined();

    editorStore.undo();
    expect(find()).toBeDefined();
  });

  it('拖曳交易只產生一個復原點', () => {
    editorStore.addElement(createRectElement({ id: 'el-drag', x: 0, y: 0 }), 'slide-01');
    const startX = 0;

    editorStore.beginTransaction();
    for (let i = 1; i <= 10; i += 1) {
      editorStore.updateElement('el-drag', { x: startX + i * 5 }, { transient: true });
    }
    editorStore.endTransaction();

    const find = () =>
      editorStore
        .getState()
        .presentation.slides.find((s) => s.id === 'slide-01')
        ?.elements.find((e) => e.id === 'el-drag');
    expect(find()?.x).toBe(50);

    editorStore.undo();
    expect(find()?.x).toBe(0);
  });

  it('鎖定的元素不會被刪除或修改', () => {
    editorStore.addElement(createRectElement({ id: 'el-locked' }), 'slide-01');
    editorStore.select(['el-locked']);
    editorStore.updateSelected({ locked: true });
    editorStore.updateSelected({ x: 999 });
    editorStore.deleteSelected();

    const el = editorStore
      .getState()
      .presentation.slides.find((s) => s.id === 'slide-01')
      ?.elements.find((e) => e.id === 'el-locked');
    expect(el).toBeDefined();
    expect(el?.x).not.toBe(999);
  });

  it('修改 AI Prompt 會同步更新 aiTasks', () => {
    editorStore.selectSlide('slide-02');
    editorStore.updateElement('ai-chart-001', { prompt: '新的 Prompt 內容' });
    const task = editorStore.getState().presentation.aiTasks.find((t) => t.id === 'TASK-001');
    expect(task?.prompt).toBe('新的 Prompt 內容');

    editorStore.undo();
    expect(
      editorStore.getState().presentation.aiTasks.find((t) => t.id === 'TASK-001')?.prompt,
    ).toContain('2024');
  });

  it('複製貼上會產生新的元素 ID 與新的 AI 任務 ID', () => {
    editorStore.selectSlide('slide-02');
    editorStore.select(['ai-chart-001']);
    editorStore.copySelection();
    editorStore.paste();

    const slide = editorStore.getState().presentation.slides.find((s) => s.id === 'slide-02')!;
    const aiElements = slide.elements.filter((e) => e.type === 'ai_component');
    expect(aiElements).toHaveLength(2);
    const ids = aiElements.map((e) => e.id);
    expect(new Set(ids).size).toBe(2);
    const taskIds = aiElements.map((e) => (e.type === 'ai_component' ? e.taskId : ''));
    expect(new Set(taskIds).size).toBe(2);
    expect(editorStore.getState().presentation.aiTasks).toHaveLength(5);
  });

  it('資料會寫入 localStorage，重新載入後不會消失', () => {
    editorStore.selectSlide('slide-02');
    editorStore.updateElement('ai-chart-001', { prompt: '重新整理後仍在' });
    editorStore.save();

    const raw = window.localStorage.getItem(STORAGE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.presentation.protocol).toBe('ai-presentation/v1');
    const el = parsed.presentation.slides
      .find((s: { id: string }) => s.id === 'slide-02')
      .elements.find((e: { id: string }) => e.id === 'ai-chart-001');
    expect(el.prompt).toBe('重新整理後仍在');
    expect(editorStore.getState().dirty).toBe(false);
  });

  it('層級調整會改變 z 值順序', () => {
    editorStore.selectSlide('slide-01');
    editorStore.select(['el-cover-bg']);
    editorStore.reorder('front');
    const slide = editorStore.getState().presentation.slides[0];
    const bg = slide.elements.find((e) => e.id === 'el-cover-bg')!;
    const others = slide.elements.filter((e) => e.id !== 'el-cover-bg');
    expect(Math.max(...others.map((e) => e.z))).toBeLessThan(bg.z);
  });

  it('對齊：單選時以投影片為基準置中', () => {
    editorStore.selectSlide('slide-01');
    editorStore.addElement(createRectElement({ id: 'el-align', x: 0, y: 0, width: 200, height: 100 }), 'slide-01');
    editorStore.select(['el-align']);
    editorStore.align('center-x');
    const el = editorStore
      .getState()
      .presentation.slides[0].elements.find((e) => e.id === 'el-align')!;
    expect(el.x).toBe((1920 - 200) / 2);
  });
});
