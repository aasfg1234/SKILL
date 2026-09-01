import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { editorStore, useEditorState } from '../store/editorStore';
import { ElementView, sortByZ } from './ElementView';
import { Icon } from './Icon';

/** 播放模式：只顯示投影片，不顯示任何編輯器介面。 */
export function PreviewOverlay() {
  const state = useEditorState();
  const { width, height } = state.presentation.settings;
  const slides = state.presentation.slides;
  const slide = slides[state.previewIndex] ?? slides[0];
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0.5);
  const [showHint, setShowHint] = useState(true);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const compute = () => {
      setScale(Math.min(el.clientWidth / width, el.clientHeight / height));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width, height]);

  useEffect(() => {
    const timer = setTimeout(() => setShowHint(false), 3200);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowRight':
        case 'PageDown':
        case ' ':
          editorStore.setPreviewIndex(editorStore.getState().previewIndex + 1);
          e.preventDefault();
          break;
        case 'ArrowLeft':
        case 'PageUp':
          editorStore.setPreviewIndex(editorStore.getState().previewIndex - 1);
          e.preventDefault();
          break;
        case 'Home':
          editorStore.setPreviewIndex(0);
          break;
        case 'End':
          editorStore.setPreviewIndex(slides.length - 1);
          break;
        case 'f':
        case 'F':
          if (document.fullscreenElement) void document.exitFullscreen();
          else void document.documentElement.requestFullscreen?.();
          e.preventDefault();
          break;
        case 'Escape':
          if (document.fullscreenElement) void document.exitFullscreen();
          else editorStore.exitPreview();
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [slides.length]);

  if (!slide) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col" style={{ background: '#0B0D10' }}>
      <div ref={wrapRef} className="flex flex-1 items-center justify-center overflow-hidden">
        <div
          style={{
            width,
            height,
            transform: `scale(${scale})`,
            transformOrigin: 'center center',
            position: 'relative',
            background: slide.background,
            flex: '0 0 auto',
          }}
        >
          {sortByZ(slide.elements).map((el) => (
            <ElementView key={el.id} el={el} mode="present" />
          ))}
        </div>
      </div>

      {showHint && (
        <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-black/40 px-4 py-1.5 text-[12px] text-white/80">
          ← → 換頁　空白鍵下一頁　F 全螢幕　Esc 離開
        </div>
      )}

      <div className="flex h-14 items-center justify-between px-5 text-white/80">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="tool-btn"
            onClick={() => editorStore.setPreviewIndex(state.previewIndex - 1)}
            disabled={state.previewIndex === 0}
          >
            <Icon name="left" size={15} />
            上一頁
          </button>
          <button
            type="button"
            className="tool-btn"
            onClick={() => editorStore.setPreviewIndex(state.previewIndex + 1)}
            disabled={state.previewIndex >= slides.length - 1}
          >
            下一頁
            <Icon name="right" size={15} />
          </button>
          <button
            type="button"
            className="tool-btn"
            onClick={() => {
              if (document.fullscreenElement) void document.exitFullscreen();
              else void document.documentElement.requestFullscreen?.();
            }}
          >
            <Icon name="fit" size={15} />
            全螢幕
          </button>
        </div>

        <div className="font-mono text-[13px]">
          第 {state.previewIndex + 1} / {slides.length} 頁
        </div>

        <button type="button" className="tool-btn" onClick={() => editorStore.exitPreview()}>
          <Icon name="close" size={15} />
          離開預覽（Esc）
        </button>
      </div>

      <div
        className="absolute bottom-0 left-0 h-[3px] transition-all"
        style={{
          width: `${slides.length > 1 ? (state.previewIndex / (slides.length - 1)) * 100 : 100}%`,
          background: 'var(--color-brand)',
        }}
      />
    </div>
  );
}
