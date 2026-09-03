import { useEffect, useRef, useState } from 'react';
import {
  copyAiInstruction,
  exportAiPackage,
  exportHtml,
  exportJson,
  exportMockCompleted,
  exportValidationReport,
  importCompleted,
  importJson,
  newPresentationFromBlank,
  resetToDemo,
  runValidation,
  saveNow,
  simulateAiCompletion,
} from '../actions';
import { editorStore, useEditorState } from '../store/editorStore';
import { Icon } from './Icon';
import { LAYER } from '../lib/layers';

interface MenuItem {
  label: string;
  icon?: string;
  shortcut?: string;
  onSelect?: () => void;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
  hint?: string;
}

function Menu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="tool-btn"
        data-active={open}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
      </button>
      {open && (
        <div
          className="panel-card aps-fade-in absolute left-0 top-[calc(100%+6px)] min-w-[264px] p-1.5 shadow-xl"
          role="menu"
          style={{ zIndex: LAYER.menu }}
        >
          {items.map((item, i) =>
            item.separator ? (
              <div key={`sep-${i}`} className="my-1.5 h-px bg-line" />
            ) : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onSelect?.();
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition hover:bg-panel-2 disabled:cursor-not-allowed disabled:opacity-40"
                style={item.danger ? { color: 'var(--color-danger)' } : undefined}
              >
                <span className="w-4 text-ink-3">
                  {item.icon ? <Icon name={item.icon} size={15} /> : null}
                </span>
                <span className="flex-1">
                  {item.label}
                  {item.hint && (
                    <span className="ml-2 text-[11px] text-ink-3">{item.hint}</span>
                  )}
                </span>
                {item.shortcut && (
                  <span className="font-mono text-[11px] text-ink-3">{item.shortcut}</span>
                )}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

export function TopBar() {
  const state = useEditorState();
  const pending = state.presentation.aiTasks.filter((t) => t.status === 'pending').length;
  const completed = state.presentation.aiTasks.filter((t) => t.status === 'completed').length;

  return (
    <header
      className="flex h-12 shrink-0 items-center gap-1 border-b px-3"
      style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel)' }}
    >
      <div className="mr-2 flex items-center gap-2 pr-2">
        <div
          className="flex h-7 w-7 items-center justify-center rounded-lg"
          style={{ background: 'var(--color-brand)', color: 'var(--color-brand-ink)' }}
        >
          <Icon name="sparkles" size={16} />
        </div>
        <div className="leading-tight">
          <div className="text-[13px] font-bold">AI 簡報工作室</div>
          <div className="text-[10px] text-ink-3">AI Presentation Studio</div>
        </div>
      </div>

      <Menu
        label="檔案"
        items={[
          { label: '新增簡報', icon: 'file', onSelect: newPresentationFromBlank },
          {
            label: '我的簡報…',
            icon: 'slides',
            onSelect: () => editorStore.openDialog({ kind: 'library' }),
          },
          { label: '開啟（匯入 JSON）', icon: 'upload', onSelect: () => void importJson() },
          { label: '儲存', icon: 'save', shortcut: 'Ctrl+S', onSelect: saveNow },
          { separator: true, label: 'sep1' },
          { label: '匯出 JSON', icon: 'download', onSelect: exportJson },
          { label: '匯出 HTML', icon: 'download', onSelect: exportHtml },
          { label: '匯出 AI Package', icon: 'package', onSelect: () => void exportAiPackage() },
          { separator: true, label: 'sep2' },
          { label: '重新載入示範簡報', icon: 'refresh', onSelect: resetToDemo, danger: true },
        ]}
      />

      <Menu
        label="編輯"
        items={[
          {
            label: '復原',
            icon: 'undo',
            shortcut: 'Ctrl+Z',
            disabled: !state.canUndo,
            onSelect: () => editorStore.undo(),
          },
          {
            label: '重做',
            icon: 'redo',
            shortcut: 'Ctrl+Shift+Z',
            disabled: !state.canRedo,
            onSelect: () => editorStore.redo(),
          },
          { separator: true, label: 'sep1' },
          {
            label: '搜尋與取代',
            icon: 'grid',
            shortcut: 'Ctrl+F',
            onSelect: () => editorStore.openDialog({ kind: 'find' }),
          },
          { separator: true, label: 'sep-find' },
          {
            label: '複製',
            icon: 'copy',
            shortcut: 'Ctrl+C',
            disabled: state.selectedIds.length === 0,
            onSelect: () => editorStore.copySelection(),
          },
          {
            label: '貼上',
            icon: 'clipboard',
            shortcut: 'Ctrl+V',
            onSelect: () => editorStore.paste(),
          },
          {
            label: '再製',
            icon: 'copy',
            shortcut: 'Ctrl+D',
            disabled: state.selectedIds.length === 0,
            onSelect: () => editorStore.duplicateSelected(),
          },
          {
            label: '刪除',
            icon: 'trash',
            shortcut: 'Delete',
            disabled: state.selectedIds.length === 0,
            onSelect: () => editorStore.deleteSelected(),
            danger: true,
          },
        ]}
      />

      <div
        className="mx-1 flex items-center gap-0.5 border-l pl-2"
        style={{ borderColor: 'var(--color-line)' }}
        aria-label="復原與重作"
      >
        <button
          type="button"
          className="tool-btn justify-center px-2"
          aria-label="復原"
          title="復原（Ctrl+Z）"
          disabled={!state.canUndo}
          onClick={() => editorStore.undo()}
        >
          <Icon name="undo" size={16} />
        </button>
        <button
          type="button"
          className="tool-btn justify-center px-2"
          aria-label="重作"
          title="重作（Ctrl+Shift+Z）"
          disabled={!state.canRedo}
          onClick={() => editorStore.redo()}
        >
          <Icon name="redo" size={16} />
        </button>
      </div>

      <Menu
        label="檢視"
        items={[
          {
            label: '符合視窗',
            icon: 'fit',
            shortcut: 'Ctrl+0',
            onSelect: () => editorStore.setFitToWindow(true),
          },
          {
            label: '放大',
            icon: 'zoom-in',
            onSelect: () => editorStore.setZoom(state.zoom * 1.2),
          },
          {
            label: '縮小',
            icon: 'zoom-out',
            onSelect: () => editorStore.setZoom(state.zoom / 1.2),
          },
          { separator: true, label: 'sep1' },
          {
            label: state.snapEnabled ? '關閉自動對齊' : '開啟自動對齊',
            icon: 'grid',
            onSelect: () => editorStore.toggleSnap(),
          },
          {
            label: state.showGuides ? '隱藏對齊輔助線' : '顯示對齊輔助線',
            icon: 'layers',
            onSelect: () => editorStore.toggleGuides(),
          },
          { separator: true, label: 'sep2' },
          {
            label: state.uiTheme === 'light' ? '切換為深色介面' : '切換為淺色介面',
            icon: 'settings',
            onSelect: () => editorStore.setUiTheme(state.uiTheme === 'light' ? 'dark' : 'light'),
          },
          {
            label: '簡報設定',
            icon: 'settings',
            onSelect: () => editorStore.openDialog({ kind: 'settings' }),
          },
        ]}
      />

      <button
        type="button"
        className="tool-btn"
        data-active={state.masterMode}
        title={state.masterMode ? '返回一般投影片' : '編輯所有投影片共用的母片'}
        onClick={() => state.masterMode ? editorStore.exitMasterMode() : editorStore.enterMasterMode()}
      >
        <Icon name="grid" size={15} />
        {state.masterMode ? '返回投影片' : '母片設計'}
      </button>

      <Menu
        label="✨ AI"
        items={[
          {
            label: '準備 AI 任務（驗證）',
            icon: 'check',
            onSelect: runValidation,
            hint: `待處理 ${pending}`,
          },
          { label: '匯出 AI Package', icon: 'package', onSelect: () => void exportAiPackage() },
          { label: '複製 AI 指令', icon: 'clipboard', onSelect: () => void copyAiInstruction() },
          { label: '匯出 JSON', icon: 'download', onSelect: exportJson },
          {
            label: '匯入 AI 完成結果',
            icon: 'upload',
            onSelect: () => void importCompleted(),
          },
          { separator: true, label: 'sep1' },
          {
            label: '模擬 AI 完成（Demo）',
            icon: 'sparkles',
            onSelect: () => simulateAiCompletion(),
            hint: '非真實 AI',
          },
          {
            label: '匯出模擬 AI Patch（Demo）',
            icon: 'download',
            onSelect: exportMockCompleted,
            hint: '非真實 AI',
          },
          { separator: true, label: 'sep2' },
          { label: '匯出 validation-report.json', icon: 'file', onSelect: exportValidationReport },
        ]}
      />

      <button type="button" className="tool-btn" onClick={() => editorStore.openDialog({ kind: 'full-ai' })}>
        <Icon name="sparkles" size={15} />
        全 AI 生成
      </button>

      <button type="button" className="tool-btn" onClick={() => editorStore.enterPreview()}>
        <Icon name="play" size={15} />
        預覽
      </button>

      <button type="button" className="tool-btn" onClick={exportHtml}>
        <Icon name="download" size={15} />
        匯出 HTML
      </button>

      <div className="mx-2 flex-1" />

      <div className="flex items-center gap-3 text-[11px] text-ink-3">
        <span className="hidden lg:inline">
          AI 任務：待處理 {pending}　已完成 {completed}
        </span>
        <span>
          {state.dirty ? '尚未儲存…' : state.savedAt ? `已儲存 ${new Date(state.savedAt).toLocaleTimeString('zh-TW')}` : '尚未儲存'}
        </span>
      </div>

      <button
        type="button"
        className="tool-btn"
        title="鍵盤快捷鍵與說明"
        onClick={() => editorStore.openDialog({ kind: 'help' })}
      >
        <Icon name="help" size={16} />
      </button>
    </header>
  );
}
