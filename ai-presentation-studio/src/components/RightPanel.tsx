import { useState } from 'react';
import { editorStore, useEditorState } from '../store/editorStore';
import { AI_KIND_LABELS, AI_STATUS_ICON, AI_STATUS_LABELS } from '../lib/labels';
import { copyAiInstruction, exportAiPackage, importCompleted, simulateAiCompletion } from '../actions';
import { AI_KIND_ICON, Icon } from './Icon';
import { Inspector } from './Inspector';
import { buildLayerList } from '../model/layerList';
import { ELEMENT_TYPE_LABELS } from '../lib/labels';

/** AI 任務面板：每個任務都可以直接跳到對應的投影片與元素。 */
function AiTaskPanel() {
  const state = useEditorState();
  const tasks = state.presentation.aiTasks;
  const counts = {
    pending: tasks.filter((t) => t.status === 'pending').length,
    processing: tasks.filter((t) => t.status === 'processing').length,
    completed: tasks.filter((t) => t.status === 'completed').length,
    error: tasks.filter((t) => t.status === 'error').length,
  };

  const statusColor = (status: string) =>
    status === 'completed'
      ? 'var(--color-ok)'
      : status === 'error'
        ? 'var(--color-danger)'
        : 'var(--color-brand)';

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-3.5 py-3" style={{ borderColor: 'var(--color-line-2)' }}>
        <div className="grid grid-cols-3 gap-1.5 text-center">
          {[
            ['待處理', counts.pending, 'var(--color-brand)'],
            ['已完成', counts.completed, 'var(--color-ok)'],
            ['失敗', counts.error, 'var(--color-danger)'],
          ].map(([label, value, color]) => (
            <div
              key={String(label)}
              className="rounded-lg py-1.5"
              style={{ background: 'var(--color-panel-2)' }}
            >
              <div className="text-[16px] font-bold" style={{ color: String(color) }}>
                {value as number}
              </div>
              <div className="text-[10.5px] text-ink-3">{label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2.5">
        {tasks.length === 0 ? (
          <div className="px-2 py-10 text-center text-[11.5px] leading-relaxed text-ink-3">
            尚未建立任何 AI 任務。
            <br />
            使用下方工具列的
            <strong className="text-brand"> ✨ AI 元件 </strong>
            在畫布上拖出一個區域，
            <br />
            即可宣告一項待 AI 完成的任務。
          </div>
        ) : (
          <ul className="space-y-1.5">
            {tasks.map((task) => {
              const slideIndex =
                state.presentation.slides.findIndex((s) => s.id === task.target.slideId) + 1;
              const active = state.selectedIds.includes(task.target.elementId);
              return (
                <li key={task.id}>
                  <button
                    type="button"
                    className="w-full rounded-lg border p-2.5 text-left transition hover:bg-panel-2"
                    style={{
                      borderColor: active ? 'var(--color-brand)' : 'var(--color-line)',
                      background: active ? 'var(--color-brand-soft)' : 'transparent',
                    }}
                    onClick={() => {
                      editorStore.selectSlide(task.target.slideId);
                      editorStore.select([task.target.elementId]);
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span style={{ color: statusColor(task.status) }}>
                        <Icon name={AI_KIND_ICON[task.type] ?? 'sparkles'} size={15} />
                      </span>
                      <span className="flex-1 text-[12.5px] font-bold">
                        {AI_KIND_LABELS[task.type]}
                      </span>
                      <span className="font-mono text-[10px] text-ink-3">{task.id}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[11px]">
                      <span className="text-ink-3">投影片 {slideIndex}</span>
                      <span className="font-bold" style={{ color: statusColor(task.status) }}>
                        {AI_STATUS_ICON[task.status]} {AI_STATUS_LABELS[task.status]}
                      </span>
                    </div>
                    {task.prompt && (
                      <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-ink-2">
                        {task.prompt}
                      </p>
                    )}
                    {!task.prompt && (
                      <p className="mt-1.5 text-[11px]" style={{ color: 'var(--color-warn)' }}>
                        尚未填寫 Prompt
                      </p>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div
        className="space-y-1.5 border-t px-3 py-3"
        style={{ borderColor: 'var(--color-line)' }}
      >
        <button
          type="button"
          className="tool-btn w-full justify-center font-bold"
          style={{ background: 'var(--color-brand)', color: 'var(--color-brand-ink)' }}
          onClick={() => void exportAiPackage()}
        >
          <Icon name="package" size={14} />
          匯出 AI Package
        </button>
        <div className="flex gap-1.5">
          <button
            type="button"
            className="tool-btn flex-1 justify-center"
            style={{ background: 'var(--color-panel-2)', border: '1px solid var(--color-line)' }}
            onClick={() => void copyAiInstruction()}
          >
            <Icon name="clipboard" size={14} />
            複製指令
          </button>
          <button
            type="button"
            className="tool-btn flex-1 justify-center"
            style={{ background: 'var(--color-panel-2)', border: '1px solid var(--color-line)' }}
            onClick={() => void importCompleted()}
          >
            <Icon name="upload" size={14} />
            匯入結果
          </button>
        </div>
        <button
          type="button"
          className="tool-btn w-full justify-center"
          onClick={() => simulateAiCompletion()}
          disabled={counts.pending + counts.error === 0}
        >
          <Icon name="sparkles" size={14} />
          模擬 AI 完成（Demo，非真實 AI）
        </button>
      </div>
    </div>
  );
}

const LAYER_ICON: Record<string, string> = {
  text: 'text',
  table: 'grid',
  rect: 'square',
  ellipse: 'circle',
  line: 'line',
  image: 'image',
  ai_component: 'sparkles',
};

/** 圖層面板：由上而下列出這一頁的元素，順序與畫布的疊放一致。 */
function LayerPanel() {
  const state = useEditorState();
  const slide = state.masterMode
    ? state.presentation.masters?.[state.masterMode]
    : state.presentation.slides.find((s) => s.id === state.currentSlideId);
  const items = slide ? buildLayerList(slide) : [];

  if (items.length === 0) {
    return (
      <div className="px-4 py-10 text-center text-[11.5px] leading-relaxed text-ink-3">
        這一頁還沒有任何元素。
        <br />
        用下方工具列新增文字、圖形、圖片或表格。
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div
        className="border-b px-3.5 py-2 text-[11px] text-ink-3"
        style={{ borderColor: 'var(--color-line-2)' }}
      >
        {state.masterMode ? '母片元素會放在每張投影片內容的下方' : '由上而下＝畫布上的疊放順序，第一個蓋在最上面'}
      </div>
      <ul className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {items.map((item) => {
          const active = state.selectedIds.includes(item.id);
          return (
            <li key={item.id}>
              <div
                className="flex items-center gap-1 rounded-lg px-1.5 py-1 transition hover:bg-panel-2"
                style={{ background: active ? 'var(--color-brand-soft)' : 'transparent' }}
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  title={`選取${ELEMENT_TYPE_LABELS[item.type]}：${item.label}`}
                  onClick={() => editorStore.select([item.id])}
                >
                  <span className="shrink-0 text-ink-3">
                    <Icon name={LAYER_ICON[item.type] ?? 'square'} size={14} />
                  </span>
                  <span
                    className="truncate text-[12px]"
                    style={{ opacity: item.hidden ? 0.45 : 1 }}
                  >
                    {item.label}
                  </span>
                </button>
                <button
                  type="button"
                  className="tool-btn px-1 py-0.5"
                  title={item.hidden ? '顯示' : '隱藏'}
                  aria-label={`${item.hidden ? '顯示' : '隱藏'}：${item.label}`}
                  data-active={item.hidden}
                  onClick={() => editorStore.updateElement(item.id, { hidden: !item.hidden })}
                >
                  <Icon name={item.hidden ? 'eye-off' : 'eye'} size={13} />
                </button>
                <button
                  type="button"
                  className="tool-btn px-1 py-0.5"
                  title={item.locked ? '解除鎖定' : '鎖定'}
                  aria-label={`${item.locked ? '解除鎖定' : '鎖定'}：${item.label}`}
                  data-active={item.locked}
                  onClick={() => editorStore.updateElement(item.id, { locked: !item.locked })}
                >
                  <Icon name={item.locked ? 'lock' : 'unlock'} size={13} />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="border-t p-2" style={{ borderColor: 'var(--color-line)' }}>
        <div className="flex gap-1.5">
          <button
            type="button"
            className="tool-btn flex-1 justify-center"
            disabled={state.selectedIds.length === 0}
            onClick={() => editorStore.reorder('forward')}
          >
            <Icon name="up" size={13} />
            往上一層
          </button>
          <button
            type="button"
            className="tool-btn flex-1 justify-center"
            disabled={state.selectedIds.length === 0}
            onClick={() => editorStore.reorder('backward')}
          >
            <Icon name="down" size={13} />
            往下一層
          </button>
        </div>
      </div>
    </div>
  );
}

export function RightPanel({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const [tab, setTab] = useState<'inspector' | 'layers' | 'tasks'>('inspector');
  const state = useEditorState();
  const pending = state.presentation.aiTasks.filter((t) => t.status !== 'completed').length;

  if (collapsed) {
    return (
      <button
        type="button"
        className="flex w-8 shrink-0 items-center justify-center border-l text-ink-3 hover:text-ink-1"
        style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel)' }}
        title="展開屬性與圖層清單"
        aria-label="展開屬性與圖層清單"
        onClick={onToggle}
      >
        <Icon name="left" size={16} />
      </button>
    );
  }

  return (
    <aside
      className="flex h-full w-[288px] shrink-0 flex-col border-l"
      style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel)' }}
    >
      <div
        className="flex shrink-0 gap-1 border-b p-1.5"
        style={{ borderColor: 'var(--color-line)' }}
      >
        <button
          type="button"
          className="tool-btn flex-1 justify-center"
          data-active={tab === 'inspector'}
          onClick={() => setTab('inspector')}
        >
          <Icon name="settings" size={14} />
          屬性
        </button>
        <button
          type="button"
          className="tool-btn flex-1 justify-center"
          data-active={tab === 'layers'}
          onClick={() => setTab('layers')}
        >
          <Icon name="layers" size={14} />
          圖層
        </button>
        <button
          type="button"
          className="tool-btn flex-1 justify-center"
          data-active={tab === 'tasks'}
          onClick={() => setTab('tasks')}
        >
          <Icon name="sparkles" size={14} />
          AI 任務
          {pending > 0 && (
            <span
              className="rounded-full px-1.5 text-[10px] font-bold"
              style={{ background: 'var(--color-brand)', color: 'var(--color-brand-ink)' }}
            >
              {pending}
            </span>
          )}
        </button>
        <button
          type="button"
          className="tool-btn shrink-0 px-1.5"
          title="收起屬性與圖層清單"
          aria-label="收起屬性與圖層清單"
          onClick={onToggle}
        >
          <Icon name="right" size={14} />
        </button>
      </div>
      <div className="min-h-0 flex-1">
        {tab === 'inspector' && <Inspector />}
        {tab === 'layers' && <LayerPanel />}
        {tab === 'tasks' && <AiTaskPanel />}
      </div>
    </aside>
  );
}
