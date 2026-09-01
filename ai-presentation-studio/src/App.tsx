import { useEffect } from 'react';
import { editorStore, useEditorState } from './store/editorStore';
import { saveNow } from './actions';
import { TopBar } from './components/TopBar';
import { SlideList } from './components/SlideList';
import { Canvas } from './components/Canvas';
import { RightPanel } from './components/RightPanel';
import { BottomToolbar } from './components/BottomToolbar';
import { PreviewOverlay } from './components/PreviewOverlay';
import { Dialogs, Toasts } from './components/Dialogs';

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

function useGlobalShortcuts() {
  const state = useEditorState();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const store = editorStore.getState();
      if (store.previewMode) return;
      const mod = e.ctrlKey || e.metaKey;
      const typing = isTypingTarget(e.target);

      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveNow();
        return;
      }
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) editorStore.redo();
        else editorStore.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        editorStore.redo();
        return;
      }
      if (mod && e.key === '0') {
        e.preventDefault();
        editorStore.setFitToWindow(true);
        return;
      }

      if (typing) return;

      if (mod && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        editorStore.copySelection();
        return;
      }
      if (mod && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        editorStore.paste();
        return;
      }
      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        editorStore.duplicateSelected();
        return;
      }
      if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        const slide = store.presentation.slides.find((s) => s.id === store.currentSlideId);
        editorStore.select((slide?.elements ?? []).map((el) => el.id));
        return;
      }

      switch (e.key) {
        case 'Delete':
        case 'Backspace':
          if (store.selectedIds.length > 0) {
            e.preventDefault();
            editorStore.deleteSelected();
          }
          break;
        case 'Escape':
          if (store.dialog) editorStore.closeDialog();
          else if (store.selectedIds.length > 0) editorStore.clearSelection();
          else editorStore.setTool('select');
          break;
        case 'ArrowLeft':
        case 'ArrowRight':
        case 'ArrowUp':
        case 'ArrowDown': {
          if (store.selectedIds.length === 0) return;
          e.preventDefault();
          const step = e.shiftKey ? 10 : 1;
          const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
          const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
          editorStore.nudge(dx, dy);
          break;
        }
        case 'v':
        case 'V':
          editorStore.setTool('select');
          break;
        case 't':
        case 'T':
          editorStore.setTool('text');
          break;
        case 'r':
        case 'R':
          editorStore.setTool('rect');
          break;
        case 'o':
        case 'O':
          editorStore.setTool('ellipse');
          break;
        case 'F5':
          e.preventDefault();
          editorStore.enterPreview();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = state.uiTheme;
  }, [state.uiTheme]);

  useEffect(() => {
    const onBeforeUnload = () => {
      editorStore.save();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);
}

export default function App() {
  const state = useEditorState();
  useGlobalShortcuts();

  if (state.previewMode) {
    return (
      <>
        <PreviewOverlay />
        <Toasts />
      </>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <SlideList />
        <main className="min-w-0 flex-1">
          <Canvas />
        </main>
        <RightPanel />
      </div>
      <BottomToolbar />
      <Dialogs />
      <Toasts />
    </div>
  );
}
