import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { editorStore, useEditorState } from '../store/editorStore';
import { ElementView, sortByZ } from './ElementView';
import { Icon } from './Icon';
import { LAYER } from '../lib/layers';
import { buildPresenterView, previewStepFromKey } from '../model/presenter';

/** 播放模式：只顯示投影片，不顯示任何編輯器介面。 */
export function PreviewOverlay() {
  const state = useEditorState();
  const { width, height } = state.presentation.settings;
  const slides = state.presentation.slides;
  const slide = slides[state.previewIndex] ?? slides[0];
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0.5);
  const [showHint, setShowHint] = useState(true);
  const [showBar, setShowBar] = useState(true);
  const [presenterOn, setPresenterOn] = useState(false);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());

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

  // 講者檢視打開時才跑計時器，關掉就停，不浪費效能。
  useEffect(() => {
    if (!presenterOn) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [presenterOn]);

  // 播放時控制列閒置就淡出，滑鼠一動再出現，畫面才不會一直被佔掉一條。
  useEffect(() => {
    let timer = window.setTimeout(() => setShowBar(false), 2600);
    const wake = () => {
      setShowBar(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setShowBar(false), 2600);
    };
    window.addEventListener('mousemove', wake);
    window.addEventListener('keydown', wake);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('mousemove', wake);
      window.removeEventListener('keydown', wake);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const step = previewStepFromKey(e.key);
      if (step !== 0) {
        editorStore.setPreviewIndex(editorStore.getState().previewIndex + step);
        e.preventDefault();
        return;
      }
      switch (e.key) {
        case 'Home':
          editorStore.setPreviewIndex(0);
          break;
        case 'End':
          editorStore.setPreviewIndex(slides.length - 1);
          break;
        case 'n':
        case 'N':
          setPresenterOn((on) => {
            if (!on) {
              setStartedAt(Date.now());
              setNow(Date.now());
            }
            return !on;
          });
          e.preventDefault();
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
    <div
      className="fixed inset-0 flex flex-col"
      style={{ background: '#0B0D10', zIndex: LAYER.preview }}
    >
      {/* 點畫面往下一頁，右鍵往上一頁；跟一般簡報軟體一致 */}
      <div
        ref={wrapRef}
        className="flex flex-1 cursor-pointer items-center justify-center overflow-hidden"
        onClick={() => editorStore.setPreviewIndex(state.previewIndex + 1)}
        onContextMenu={(e) => {
          e.preventDefault();
          editorStore.setPreviewIndex(state.previewIndex - 1);
        }}
      >
        <div
          style={{
            width,
            height,
            transform: `scale(${scale})`,
            transformOrigin: 'center center',
            position: 'relative',
            background: slide.background,
            fontFamily: state.presentation.theme.fontFamily,
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
          點畫面下一頁　← → ↑ ↓ 換頁　F 全螢幕　N 講者檢視　Esc 離開
        </div>
      )}

      <div
        className="flex h-14 items-center justify-between px-5 text-white/80 transition-opacity duration-300"
        style={{ opacity: showBar ? 1 : 0, pointerEvents: showBar ? 'auto' : 'none' }}
      >
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
          <button
            type="button"
            className="tool-btn"
            data-active={presenterOn}
            title="講者檢視（N）"
            onClick={() => {
              if (!presenterOn) {
                setStartedAt(Date.now());
                setNow(Date.now());
              }
              setPresenterOn((on) => !on);
            }}
          >
            <Icon name="text" size={15} />
            講者檢視
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

      {presenterOn && (
        <aside
          className="absolute bottom-16 right-4 flex w-[380px] max-h-[60vh] flex-col gap-2.5 overflow-auto rounded-2xl p-4 text-white shadow-2xl"
          style={{
            background: 'rgba(15,17,21,.94)',
            border: '1px solid rgba(255,255,255,.14)',
            zIndex: 1,
          }}
          aria-label="講者檢視"
        >
          {(() => {
            const view = buildPresenterView(slides, state.previewIndex, now - startedAt);
            return (
              <>
                <div className="flex items-baseline justify-between gap-3">
                  <strong className="text-[13px]">講者檢視</strong>
                  <span className="font-mono text-[22px] font-bold tabular-nums">
                    {view.elapsedText}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 text-[11.5px] text-white/60">
                  <span>
                    第 {view.current.index + 1} / {view.total} 頁　{view.current.title}
                  </span>
                  <button
                    type="button"
                    className="rounded-md px-2 py-0.5 text-[11px] text-white/80"
                    style={{ background: 'rgba(255,255,255,.12)' }}
                    onClick={() => {
                      setStartedAt(Date.now());
                      setNow(Date.now());
                    }}
                  >
                    計時歸零
                  </button>
                </div>
                <div
                  className="flex-1 whitespace-pre-wrap pt-2.5 text-[15px] leading-relaxed"
                  style={{ borderTop: '1px solid rgba(255,255,255,.14)' }}
                >
                  {view.current.notes || (
                    <span className="text-white/40">{view.notesPlaceholder}</span>
                  )}
                </div>
                <div
                  className="pt-2 text-[12px] text-white/60"
                  style={{ borderTop: '1px solid rgba(255,255,255,.12)' }}
                >
                  {view.next ? `下一頁：${view.next.title || '（未命名）'}` : '這是最後一頁'}
                </div>
                <div className="text-[11px] leading-snug text-white/40">
                  這是編輯器內的排練用面板，顯示在同一個畫面上。
                  正式簡報請匯出 HTML，在那裡按 N 會開成獨立視窗。
                </div>
              </>
            );
          })()}
        </aside>
      )}

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
