import { useEffect, useRef, useState } from 'react';
import { editorStore, useEditorState, type ToolId } from '../store/editorStore';
import { Icon } from './Icon';

const TOOLS: Array<{ id: ToolId; label: string; icon: string; hint: string }> = [
  { id: 'select', label: '選取', icon: 'layers', hint: '選取、拖曳、調整大小' },
  { id: 'text', label: '文字', icon: 'text', hint: '拖出一個文字方塊' },
  { id: 'image', label: '圖片', icon: 'image', hint: '插入本機圖片' },
  { id: 'rect', label: '圖形', icon: 'square', hint: '矩形' },
  { id: 'ellipse', label: '圓形', icon: 'circle', hint: '橢圓／圓形' },
  { id: 'line', label: '線條', icon: 'line', hint: '直線' },
];

export function BottomToolbar() {
  const state = useEditorState();
  const currentSlide = state.presentation.slides.find(
    (slide) => slide.id === state.currentSlideId,
  );
  const [arrangeOpen, setArrangeOpen] = useState(false);
  const arrangeRef = useRef<HTMLDivElement | null>(null);
  const editingGroupName = useRef(false);
  const selectedElements = (currentSlide?.elements ?? []).filter((el) =>
    state.selectedIds.includes(el.id),
  );
  const canUngroup = selectedElements.some((el) => el.groupId);
  const selectedGroupIds = new Set(
    selectedElements.flatMap((el) => (el.groupId ? [el.groupId] : [])),
  );
  const singleGroupId =
    selectedGroupIds.size === 1 && selectedElements.every((el) => el.groupId)
      ? [...selectedGroupIds][0]
      : null;
  const singleGroupName = singleGroupId
    ? selectedElements.find((el) => el.groupId === singleGroupId)?.groupName ?? ''
    : '';

  useEffect(() => {
    if (!arrangeOpen) return;
    const close = (event: MouseEvent) => {
      if (!arrangeRef.current?.contains(event.target as Node)) setArrangeOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [arrangeOpen]);

  useEffect(() => {
    if (arrangeOpen || !editingGroupName.current) return;
    editingGroupName.current = false;
    editorStore.endTransaction();
  }, [arrangeOpen]);

  return (
    <footer
      className="flex h-12 shrink-0 items-center gap-1 border-t px-3"
      style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel)' }}
    >
      {TOOLS.map((tool) => (
        <button
          key={tool.id}
          type="button"
          className="tool-btn"
          data-active={state.tool === tool.id}
          title={tool.hint}
          onClick={() => editorStore.setTool(tool.id)}
        >
          <Icon name={tool.icon} size={15} />
          {tool.label}
        </button>
      ))}

      <div className="mx-1 h-6 w-px" style={{ background: 'var(--color-line)' }} />

      <button
        type="button"
        className="tool-btn font-bold"
        data-active={state.tool === 'ai_component'}
        title="在畫布上拖出一個區域，宣告一項待 AI 完成的任務"
        style={
          state.tool === 'ai_component'
            ? undefined
            : { background: 'var(--color-brand)', color: 'var(--color-brand-ink)' }
        }
        onClick={() => editorStore.setTool('ai_component')}
      >
        <Icon name="sparkles" size={15} />
        AI 元件
      </button>

      <span className="ml-1 text-[11px] text-ink-3">
        {state.tool === 'select' &&
          '提示：雙擊文字可直接編輯；按住 Shift 可複選；按住 Alt 暫時關閉自動對齊。'}
        {state.tool === 'text' && '在畫布上點一下或拖曳文字框，接著直接輸入文字。'}
        {state.tool === 'image' && '在畫布上點一下或拖曳圖片框，接著選擇圖片。'}
        {state.tool === 'ai_component' &&
          '在畫布上點一下或拖曳 AI 元件，接著在右側輸入 Prompt。'}
        {state.tool !== 'select' &&
          state.tool !== 'text' &&
          state.tool !== 'image' &&
          state.tool !== 'ai_component' &&
          '在畫布上點一下或拖曳，即可新增元素。'}
      </span>

      <div className="flex-1" />

      <div className="flex items-center gap-1">
        <button
          type="button"
          className="tool-btn px-1.5"
          title="縮小"
          onClick={() => editorStore.setZoom(state.zoom / 1.2)}
        >
          <Icon name="zoom-out" size={15} />
        </button>
        <span className="w-12 text-center font-mono text-[11px] text-ink-2">
          {Math.round(state.zoom * 100)}%
        </span>
        <button
          type="button"
          className="tool-btn px-1.5"
          title="放大"
          onClick={() => editorStore.setZoom(state.zoom * 1.2)}
        >
          <Icon name="zoom-in" size={15} />
        </button>
        <button
          type="button"
          className="tool-btn"
          data-active={state.fitToWindow}
          title="符合視窗（Ctrl+0）"
          onClick={() => editorStore.setFitToWindow(true)}
        >
          <Icon name="fit" size={15} />
          符合視窗
        </button>
        <div className="relative" ref={arrangeRef}>
          <button
            type="button"
            className="tool-btn"
            data-active={arrangeOpen}
            title="排列與拖曳吸附"
            aria-expanded={arrangeOpen}
            onClick={() => setArrangeOpen((open) => !open)}
          >
            <Icon name="align-center-x" size={15} />
            排列
          </button>
          {arrangeOpen && (
            <div
              className="panel-card absolute bottom-[calc(100%+8px)] right-0 z-50 w-72 p-2 shadow-xl"
              role="menu"
              aria-label="排列元件"
            >
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-ink-2">
                  已選取 {state.selectedIds.length} 個元件
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    role="menuitem"
                    className="tool-btn px-1.5 py-1 text-[10px]"
                    disabled={!currentSlide?.elements.length}
                    onClick={() =>
                      editorStore.select((currentSlide?.elements ?? []).map((el) => el.id))
                    }
                  >
                    全選本頁
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="tool-btn px-1.5 py-1 text-[10px]"
                    disabled={state.selectedIds.length === 0}
                    onClick={() => editorStore.clearSelection()}
                  >
                    取消選取
                  </button>
                </div>
              </div>
              <div className="mb-1.5 text-[10px] text-ink-3">
                {state.selectedIds.length > 1 ? '以下動作以選取範圍為基準' : '單選時以投影片為基準'}
              </div>
              <div className="grid grid-cols-2 gap-1">
                <button
                  type="button"
                  role="menuitem"
                  className="tool-btn justify-center"
                  disabled={state.selectedIds.length < 2}
                  title="建立群組（Ctrl+G）"
                  onClick={() => {
                    editorStore.groupSelected();
                    setArrangeOpen(false);
                  }}
                >
                  <Icon name="group" size={14} />
                  建立群組
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="tool-btn justify-center"
                  disabled={!canUngroup}
                  title="取消群組（Ctrl+Shift+G）"
                  onClick={() => {
                    editorStore.ungroupSelected();
                    setArrangeOpen(false);
                  }}
                >
                  <Icon name="ungroup" size={14} />
                  取消群組
                </button>
              </div>
              {singleGroupId && (
                <label className="mt-2 block text-[10px] font-bold text-ink-3">
                  群組名稱
                  <input
                    className="field mt-1 w-full"
                    aria-label="群組名稱"
                    value={singleGroupName}
                    onFocus={() => {
                      if (editingGroupName.current) return;
                      editingGroupName.current = true;
                      editorStore.beginTransaction();
                    }}
                    onChange={(event) =>
                      editorStore.renameGroup(singleGroupId, event.target.value, { transient: true })
                    }
                    onBlur={(event) => {
                      if (!event.currentTarget.value.trim()) {
                        editorStore.renameGroup(singleGroupId, '未命名群組', { transient: true });
                      } else if (event.currentTarget.value !== event.currentTarget.value.trim()) {
                        editorStore.renameGroup(singleGroupId, event.currentTarget.value.trim(), {
                          transient: true,
                        });
                      }
                      if (editingGroupName.current) editorStore.endTransaction();
                      editingGroupName.current = false;
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') event.currentTarget.blur();
                      if (event.key === 'Escape') event.currentTarget.blur();
                    }}
                  />
                </label>
              )}
              <div className="my-2 h-px bg-line" />
              <div className="grid grid-cols-3 gap-1">
                {(
                  [
                    ['left', 'align-left', '靠左'],
                    ['center-x', 'align-center-x', '水平置中'],
                    ['right', 'align-right', '靠右'],
                    ['top', 'align-top', '靠上'],
                    ['center-y', 'align-center-y', '垂直置中'],
                    ['bottom', 'align-bottom', '靠下'],
                  ] as const
                ).map(([mode, icon, label]) => (
                  <button
                    key={mode}
                    type="button"
                    role="menuitem"
                    className="tool-btn justify-center px-1"
                    disabled={state.selectedIds.length === 0}
                    title={label}
                    onClick={() => {
                      editorStore.align(mode);
                      setArrangeOpen(false);
                    }}
                  >
                    <Icon name={icon} size={14} />
                    <span className="text-[10px]">{label}</span>
                  </button>
                ))}
              </div>
              <div className="my-2 h-px bg-line" />
              <div className="grid grid-cols-2 gap-1">
                <button
                  type="button"
                  role="menuitem"
                  className="tool-btn justify-center"
                  disabled={state.selectedIds.length < 3}
                  title="至少選取三個元件"
                  onClick={() => {
                    editorStore.distribute('horizontal');
                    setArrangeOpen(false);
                  }}
                >
                  <Icon name="align-center-x" size={14} />
                  水平等距
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="tool-btn justify-center"
                  disabled={state.selectedIds.length < 3}
                  title="至少選取三個元件"
                  onClick={() => {
                    editorStore.distribute('vertical');
                    setArrangeOpen(false);
                  }}
                >
                  <Icon name="align-center-y" size={14} />
                  垂直等距
                </button>
              </div>
              <div className="my-2 h-px bg-line" />
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={state.snapEnabled}
                className="tool-btn w-full justify-start"
                data-active={state.snapEnabled}
                onClick={() => editorStore.toggleSnap()}
              >
                <Icon name="grid" size={14} />
                拖曳時自動吸附
              </button>
            </div>
          )}
        </div>
      </div>
    </footer>
  );
}
