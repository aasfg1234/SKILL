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
        {state.tool === 'select'
          ? '提示：雙擊文字可直接編輯；按住 Shift 可複選；按住 Alt 暫時關閉自動對齊。'
          : '提示：在畫布上按住並拖曳，即可畫出元素。'}
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
        <button
          type="button"
          className="tool-btn"
          data-active={state.snapEnabled}
          title="自動對齊"
          onClick={() => editorStore.toggleSnap()}
        >
          <Icon name="grid" size={15} />
          對齊
        </button>
      </div>
    </footer>
  );
}
