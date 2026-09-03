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

  it('投影片可以拖曳到指定頁面前後並復原', () => {
    const originalIds = editorStore.getState().presentation.slides.map((slide) => slide.id);

    editorStore.moveSlideTo('slide-01', 'slide-03', 'after');
    expect(editorStore.getState().presentation.slides.map((slide) => slide.id)).toEqual([
      originalIds[1],
      originalIds[2],
      originalIds[0],
      ...originalIds.slice(3),
    ]);
    expect(editorStore.getState().currentSlideId).toBe('slide-01');

    editorStore.undo();
    expect(editorStore.getState().presentation.slides.map((slide) => slide.id)).toEqual(originalIds);
  });

  it('可以切換到上一張或下一張投影片，且不會越過頭尾', () => {
    expect(editorStore.navigateSlide(-1)).toBe(false);
    expect(editorStore.getState().currentSlideId).toBe('slide-01');

    expect(editorStore.navigateSlide(1)).toBe(true);
    expect(editorStore.getState().currentSlideId).toBe('slide-02');

    expect(editorStore.navigateSlide(-1)).toBe(true);
    expect(editorStore.getState().currentSlideId).toBe('slide-01');

    const lastSlide = editorStore.getState().presentation.slides.at(-1);
    editorStore.selectSlide(lastSlide!.id);
    expect(editorStore.navigateSlide(1)).toBe(false);
    expect(editorStore.getState().currentSlideId).toBe(lastSlide!.id);
  });

  it('封面與內容母片可以分開編輯及套用背景', () => {
    editorStore.enterMasterMode('cover');
    expect(editorStore.getState().masterMode).toBe('cover');

    const footer = createTextElement({ id: 'master-footer', text: '共用頁尾', x: 100, y: 980 });
    editorStore.addElement(footer);
    expect(editorStore.getState().presentation.masters?.cover.elements).toHaveLength(1);
    expect(editorStore.getState().presentation.masters?.content.elements).toHaveLength(0);
    expect(editorStore.getState().presentation.slides[0].elements).not.toContainEqual(
      expect.objectContaining({ id: 'master-footer' }),
    );

    editorStore.updateElement('master-footer', { text: '更新後頁尾' });
    expect(editorStore.getState().presentation.masters?.cover.elements[0]).toMatchObject({
      id: 'master-footer',
      text: '更新後頁尾',
    });
    editorStore.undo();
    expect(editorStore.getState().presentation.masters?.cover.elements[0]).toMatchObject({
      text: '共用頁尾',
    });
    editorStore.redo();
    expect(editorStore.getState().presentation.masters?.cover.elements[0]).toMatchObject({
      text: '更新後頁尾',
    });

    editorStore.getState().presentation.slides.forEach((slide) => {
      editorStore.updateSlide(slide.id, { useMasterBackground: false });
    });
    editorStore.applyMasterBackgroundToAllSlides();
    expect(editorStore.getState().presentation.slides[0].useMasterBackground).toBe(true);
    expect(editorStore.getState().presentation.slides[1].useMasterBackground).toBe(false);

    editorStore.exitMasterMode();
    expect(editorStore.getState().masterMode).toBe(null);
    expect(editorStore.getState().presentation.masters?.cover.elements[0]).toMatchObject({
      text: '更新後頁尾',
    });
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

  it('連續文字輸入只產生一個復原點', () => {
    editorStore.addElement(
      createTextElement({ id: 'el-text-edit', text: '原始文字' }),
      'slide-01',
    );

    editorStore.beginTransaction();
    editorStore.updateElement('el-text-edit', { text: '原始文字 A' }, { transient: true });
    editorStore.updateElement('el-text-edit', { text: '原始文字 AB' }, { transient: true });
    editorStore.updateElement('el-text-edit', { text: '原始文字 ABC' }, { transient: true });
    editorStore.endTransaction();

    const findText = () => {
      const el = editorStore
        .getState()
        .presentation.slides.find((s) => s.id === 'slide-01')
        ?.elements.find((item) => item.id === 'el-text-edit');
      return el?.type === 'text' ? el.text : undefined;
    };

    expect(findText()).toBe('原始文字 ABC');
    editorStore.undo();
    expect(findText()).toBe('原始文字');
    editorStore.redo();
    expect(findText()).toBe('原始文字 ABC');
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

  it('三個元件可以水平與垂直等距排列', () => {
    const items = [
      createRectElement({ id: 'dist-a', x: 100, y: 100, width: 100, height: 100 }),
      createRectElement({ id: 'dist-b', x: 280, y: 260, width: 100, height: 100 }),
      createRectElement({ id: 'dist-c', x: 700, y: 700, width: 100, height: 100 }),
    ];
    for (const item of items) editorStore.addElement(item, 'slide-01');
    editorStore.select(items.map((item) => item.id));

    editorStore.distribute('horizontal');
    let current = editorStore
      .getState()
      .presentation.slides[0].elements.filter((el) => items.some((item) => item.id === el.id));
    current = [...current].sort((a, b) => a.x - b.x);
    expect(current[1].x - (current[0].x + current[0].width)).toBe(200);
    expect(current[2].x - (current[1].x + current[1].width)).toBe(200);

    editorStore.distribute('vertical');
    current = editorStore
      .getState()
      .presentation.slides[0].elements.filter((el) => items.some((item) => item.id === el.id));
    current = [...current].sort((a, b) => a.y - b.y);
    expect(current[1].y - (current[0].y + current[0].height)).toBe(200);
    expect(current[2].y - (current[1].y + current[1].height)).toBe(200);
  });

  it('等距排列空間不足時會顯示警告', () => {
    const items = [
      createRectElement({ id: 'wide-a', x: 0, width: 900 }),
      createRectElement({ id: 'wide-b', x: 500, width: 900 }),
      createRectElement({ id: 'wide-c', x: 1020, width: 900 }),
    ];
    for (const item of items) editorStore.addElement(item, 'slide-01');
    editorStore.select(items.map((item) => item.id));

    editorStore.distribute('horizontal');

    expect(
      editorStore.getState().toasts.some((toast) => toast.title === '選取範圍空間不足'),
    ).toBe(true);
  });

  it('建立群組後，點一個成員會選到整組並一起移動', () => {
    const items = [
      createRectElement({ id: 'group-a', x: 100, y: 120 }),
      createRectElement({ id: 'group-b', x: 700, y: 320 }),
    ];
    for (const item of items) editorStore.addElement(item, 'slide-01');
    editorStore.select(items.map((item) => item.id));
    editorStore.groupSelected();

    const grouped = editorStore
      .getState()
      .presentation.slides[0].elements.filter((el) => items.some((item) => item.id === el.id));
    expect(grouped[0].groupId).toBeTruthy();
    expect(grouped[1].groupId).toBe(grouped[0].groupId);

    editorStore.clearSelection();
    editorStore.selectElement('group-a');
    expect(editorStore.getState().selectedIds).toEqual(['group-a', 'group-b']);
    editorStore.nudge(15, 25);

    const moved = editorStore
      .getState()
      .presentation.slides[0].elements.filter((el) => items.some((item) => item.id === el.id));
    expect(moved.map((el) => [el.x, el.y])).toEqual([
      [115, 145],
      [715, 345],
    ]);
  });

  it('群組建立與取消都支援復原及重做', () => {
    const items = [
      createTextElement({ id: 'undo-group-a', text: '甲' }),
      createTextElement({ id: 'undo-group-b', text: '乙' }),
    ];
    for (const item of items) editorStore.addElement(item, 'slide-01');
    editorStore.select(items.map((item) => item.id));
    editorStore.groupSelected();
    const groupId = editorStore.selectedElements()[0].groupId;

    editorStore.undo();
    expect(editorStore.selectedElements().every((el) => !el.groupId)).toBe(true);
    editorStore.redo();
    expect(editorStore.selectedElements().every((el) => el.groupId === groupId)).toBe(true);

    editorStore.ungroupSelected();
    expect(editorStore.selectedElements().every((el) => !el.groupId)).toBe(true);
    editorStore.undo();
    expect(editorStore.selectedElements().every((el) => el.groupId === groupId)).toBe(true);
  });

  it('複製群組會建立新的群組，不會連到原本群組', () => {
    const items = [
      createRectElement({ id: 'copy-group-a' }),
      createRectElement({ id: 'copy-group-b' }),
    ];
    for (const item of items) editorStore.addElement(item, 'slide-01');
    editorStore.select(items.map((item) => item.id));
    editorStore.groupSelected();
    const originalGroupId = editorStore.selectedElements()[0].groupId;
    const originalGroupName = editorStore.selectedElements()[0].groupName;

    editorStore.duplicateSelected();
    const copies = editorStore.selectedElements();
    expect(copies).toHaveLength(2);
    expect(copies[0].groupId).toBeTruthy();
    expect(copies[1].groupId).toBe(copies[0].groupId);
    expect(copies[0].groupId).not.toBe(originalGroupId);
    expect(copies[0].groupName).toBe(`${originalGroupName}（複本）`);
  });

  it('修改群組名稱只產生一個復原點', () => {
    const items = [
      createRectElement({ id: 'rename-group-a' }),
      createRectElement({ id: 'rename-group-b' }),
    ];
    for (const item of items) editorStore.addElement(item, 'slide-01');
    editorStore.select(items.map((item) => item.id));
    editorStore.groupSelected();
    const groupId = editorStore.selectedElements()[0].groupId!;
    const originalName = editorStore.selectedElements()[0].groupName;

    editorStore.beginTransaction();
    editorStore.renameGroup(groupId, '首', { transient: true });
    editorStore.renameGroup(groupId, '首頁', { transient: true });
    editorStore.renameGroup(groupId, '首頁標題', { transient: true });
    editorStore.endTransaction();

    expect(editorStore.selectedElements().every((el) => el.groupName === '首頁標題')).toBe(true);
    editorStore.undo();
    expect(editorStore.selectedElements().every((el) => el.groupName === originalName)).toBe(true);
  });

  it('群組命名與縮放經過預覽後仍可完整復原', () => {
    const first = createRectElement({ id: 'flow-group-a', x: 100, y: 100, width: 200, height: 100 });
    const second = createRectElement({ id: 'flow-group-b', x: 400, y: 250, width: 300, height: 150 });
    const presentation = createDemoPresentation();
    presentation.slides[0].elements = [first, second];
    editorStore.replacePresentation(presentation, { resetHistory: true });
    editorStore.selectSlide('slide-01');
    editorStore.select([first.id, second.id]);
    editorStore.groupSelected();
    const groupId = editorStore.selectedElements()[0].groupId!;

    editorStore.beginTransaction();
    editorStore.renameGroup(groupId, '流程群組', { transient: true });
    editorStore.endTransaction();
    editorStore.beginTransaction();
    editorStore.transient((draft) => {
      for (const el of draft.slides[0].elements) {
        el.width *= 2;
        el.height *= 2;
      }
    });
    editorStore.endTransaction();
    editorStore.enterPreview();
    editorStore.exitPreview();

    editorStore.undo();
    expect(editorStore.selectedElements().map((el) => el.width)).toEqual([200, 300]);
    editorStore.undo();
    expect(editorStore.selectedElements().every((el) => el.groupName === '群組 1')).toBe(true);
    editorStore.undo();
    expect(editorStore.selectedElements().every((el) => !el.groupId)).toBe(true);
  });

  it('鎖定的元件不會被加入群組', () => {
    const unlocked = createRectElement({ id: 'group-unlocked' });
    const locked = createRectElement({ id: 'group-locked', locked: true });
    editorStore.addElement(unlocked, 'slide-01');
    editorStore.addElement(locked, 'slide-01');
    editorStore.select([unlocked.id, locked.id]);
    editorStore.groupSelected();

    expect(editorStore.selectedElements().every((el) => !el.groupId)).toBe(true);
    expect(
      editorStore.getState().toasts.some((toast) => toast.title === '鎖定的元件不能加入群組'),
    ).toBe(true);
  });

  it('在示範簡報上新增元素時會疊到最上層，不會被既有元素蓋住', () => {
    const slideBefore = editorStore
      .getState()
      .presentation.slides.find((slide) => slide.id === 'slide-01');
    const highestBefore = Math.max(...(slideBefore?.elements ?? []).map((el) => el.z));

    const drawn = createRectElement({ id: 'drawn-on-cover' });
    editorStore.addElement(drawn, 'slide-01');

    const added = editorStore
      .getState()
      .presentation.slides.find((slide) => slide.id === 'slide-01')
      ?.elements.find((el) => el.id === 'drawn-on-cover');

    expect(added?.z).toBe(highestBefore + 1);
  });

  it('新投影片依照插入位置命名，不用總張數', () => {
    editorStore.addSlide('slide-01');

    const slides = editorStore.getState().presentation.slides;
    expect(slides[1].title).toBe('投影片 2');
  });

  it('刪除投影片前會先問過，不會直接刪掉', () => {
    const before = editorStore.getState().presentation.slides.length;

    editorStore.requestDeleteSlide('slide-02');

    expect(editorStore.getState().dialog?.kind).toBe('confirm');
    expect(editorStore.getState().presentation.slides).toHaveLength(before);
  });

  it('刪除投影片後會提示可以復原', () => {
    editorStore.deleteSlide('slide-02');

    const toast = editorStore.getState().toasts.find((item) => item.title.includes('已刪除投影片'));
    expect(toast?.detail).toContain('Ctrl+Z');
  });

  it('新增投影片可以指定版型', () => {
    editorStore.addSlide('slide-01', 'title-content');

    const slide = editorStore.getState().presentation.slides[1];
    expect(slide.elements.length).toBeGreaterThan(0);
    expect(slide.elements.some((el) => el.type === 'text')).toBe(true);
  });

  it('沒有指定版型時新增空白投影片', () => {
    editorStore.addSlide('slide-01');

    expect(editorStore.getState().presentation.slides[1].elements).toEqual([]);
  });

  it('離開編輯狀態會結束連續編輯，之後每一次修改都是獨立的復原點', () => {
    // 重現：雙擊表格會開始一段連續編輯，使用者用滑鼠點別處離開。
    editorStore.beginTransaction();
    editorStore.clearSelection();

    editorStore.addElement(createRectElement({ id: 'first' }), 'slide-01');
    editorStore.addElement(createRectElement({ id: 'second' }), 'slide-01');

    const ids = () =>
      editorStore.getState().presentation.slides[0].elements.map((el) => el.id);
    editorStore.undo();

    expect(ids()).not.toContain('second');
    expect(ids()).toContain('first');
  });

  it('切換投影片也會結束連續編輯', () => {
    editorStore.beginTransaction();
    editorStore.selectSlide('slide-02');

    editorStore.addElement(createRectElement({ id: 'later' }), 'slide-02');
    editorStore.undo();

    const slide = editorStore.getState().presentation.slides[1];
    expect(slide.elements.map((el) => el.id)).not.toContain('later');
    // 只退掉那一次新增，而且可以重做回來
    editorStore.redo();
    expect(
      editorStore.getState().presentation.slides[1].elements.map((el) => el.id),
    ).toContain('later');
  });

  it('新增元素後預設跳回選取工具', () => {
    editorStore.setTool('rect');
    editorStore.addElement(createRectElement({ id: 'one' }), 'slide-01');

    expect(editorStore.getState().tool).toBe('select');
  });

  it('鎖定工具後可以連續新增，工具不會跳回選取', () => {
    editorStore.setToolLocked(true);
    editorStore.setTool('rect');
    editorStore.addElement(createRectElement({ id: 'one' }), 'slide-01');

    expect(editorStore.getState().tool).toBe('rect');

    editorStore.setToolLocked(false);
    editorStore.addElement(createRectElement({ id: 'two' }), 'slide-01');
    expect(editorStore.getState().tool).toBe('select');
  });

  it('可以改主題顏色，而且能復原', () => {
    editorStore.setThemeColor('primary', '#FF0000');

    expect(editorStore.getState().presentation.theme.palette.primary).toBe('#FF0000');
    editorStore.undo();
    expect(editorStore.getState().presentation.theme.palette.primary).not.toBe('#FF0000');
  });
});
