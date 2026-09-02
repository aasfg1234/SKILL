import { useRef, useState } from 'react';
import { editorStore, useEditorState } from '../store/editorStore';
import type { Slide } from '../model/types';
import { ElementView, sortByZ } from './ElementView';
import { Icon } from './Icon';
import { LAYER } from '../lib/layers';

const THUMB_WIDTH = 176;

function Thumbnail({ slide }: { slide: Slide }) {
  const state = useEditorState();
  const { width, height } = state.presentation.settings;
  const scale = THUMB_WIDTH / width;

  return (
    <div
      className="relative overflow-hidden rounded-md border"
      style={{
        width: THUMB_WIDTH,
        height: height * scale,
        borderColor: 'var(--color-line)',
        background: slide.background,
      }}
    >
      <div
        style={{
          width,
          height,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          position: 'absolute',
          left: 0,
          top: 0,
        }}
      >
        {sortByZ(slide.elements).map((el) => (
          <ElementView key={el.id} el={el} mode="thumb" />
        ))}
      </div>
    </div>
  );
}

export function SlideList() {
  const state = useEditorState();
  const slides = state.presentation.slides;
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    slideId: string;
    position: 'before' | 'after';
  } | null>(null);
  const pointerDrag = useRef<{
    slideId: string;
    startX: number;
    startY: number;
    active: boolean;
  } | null>(null);
  const suppressClick = useRef(false);

  const clearDrag = () => {
    setDraggingId(null);
    setDropTarget(null);
  };

  const findDropTarget = (clientX: number, clientY: number, sourceId: string) => {
    const card = document
      .elementsFromPoint(clientX, clientY)
      .map((element) => element.closest<HTMLElement>('[data-slide-id]'))
      .find((element) => element?.dataset.slideId && element.dataset.slideId !== sourceId);
    if (!card?.dataset.slideId) return null;
    const rect = card.getBoundingClientRect();
    return {
      slideId: card.dataset.slideId,
      position: clientY < rect.top + rect.height / 2 ? ('before' as const) : ('after' as const),
    };
  };

  return (
    <aside
      className="flex h-full w-[228px] shrink-0 flex-col border-r"
      style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel)' }}
    >
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-[12px] font-bold">
          <Icon name="slides" size={14} />
          投影片
          <span className="text-ink-3">（{slides.length}）</span>
        </div>
        <button
          type="button"
          className="tool-btn px-1.5"
          title="新增投影片"
          onClick={() =>
            editorStore.openDialog({ kind: 'layout', afterSlideId: state.currentSlideId })
          }
        >
          <Icon name="plus" size={15} />
        </button>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto px-3 pb-3">
        {slides.map((slide, index) => {
          const active = slide.id === state.currentSlideId;
          const aiCount = slide.elements.filter((el) => el.type === 'ai_component').length;
          const pendingCount = slide.elements.filter(
            (el) => el.type === 'ai_component' && el.status !== 'completed',
          ).length;
          return (
            <div
              key={slide.id}
              className="group relative rounded-lg p-1.5 transition"
              data-slide-id={slide.id}
              aria-label={`投影片 ${index + 1}：${slide.title}，可拖曳調整順序`}
              style={{
                background: active ? 'var(--color-brand-soft)' : 'transparent',
                outline: active ? '1.5px solid var(--color-brand)' : '1px solid transparent',
                cursor: draggingId === slide.id ? 'grabbing' : 'grab',
                opacity: draggingId === slide.id ? 0.55 : 1,
                userSelect: 'none',
              }}
              onClick={() => {
                if (suppressClick.current) return;
                editorStore.selectSlide(slide.id);
              }}
              onPointerDown={(event) => {
                if (event.button !== 0 || (event.target as HTMLElement).closest('button')) return;
                pointerDrag.current = {
                  slideId: slide.id,
                  startX: event.clientX,
                  startY: event.clientY,
                  active: false,
                };
                event.currentTarget.setPointerCapture?.(event.pointerId);
              }}
              onPointerMove={(event) => {
                const current = pointerDrag.current;
                if (!current) return;
                if (!current.active) {
                  const distance = Math.hypot(
                    event.clientX - current.startX,
                    event.clientY - current.startY,
                  );
                  if (distance < 6) return;
                  current.active = true;
                  setDraggingId(current.slideId);
                }
                setDropTarget(findDropTarget(event.clientX, event.clientY, current.slideId));
              }}
              onPointerUp={(event) => {
                const current = pointerDrag.current;
                pointerDrag.current = null;
                const target = current
                  ? findDropTarget(event.clientX, event.clientY, current.slideId) ?? dropTarget
                  : null;
                if (current?.active && target) {
                  editorStore.moveSlideTo(current.slideId, target.slideId, target.position);
                  suppressClick.current = true;
                  setTimeout(() => {
                    suppressClick.current = false;
                  }, 0);
                }
                clearDrag();
                event.currentTarget.releasePointerCapture?.(event.pointerId);
              }}
              onPointerCancel={() => {
                pointerDrag.current = null;
                clearDrag();
              }}
            >
              {dropTarget?.slideId === slide.id && draggingId !== slide.id && (
                <div
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    left: 2,
                    right: 2,
                    height: 3,
                    borderRadius: 999,
                    background: 'var(--color-brand)',
                    zIndex: LAYER.slideDrag,
                    ...(dropTarget.position === 'before' ? { top: -5 } : { bottom: -5 }),
                  }}
                />
              )}
              <div className="mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1 text-[11px] font-bold text-ink-2">
                  <span className="text-ink-3" aria-hidden="true">⋮⋮</span>
                  {index + 1}
                </span>
                <div className="pointer-events-none flex items-center gap-0.5 opacity-0 transition group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
                  <button
                    type="button"
                    className="tool-btn px-1 py-0.5"
                    title="上移"
                    aria-label={`把第 ${index + 1} 張投影片上移`}
                    disabled={index === 0}
                    onClick={(e) => {
                      e.stopPropagation();
                      editorStore.moveSlide(slide.id, -1);
                    }}
                  >
                    <Icon name="up" size={13} />
                  </button>
                  <button
                    type="button"
                    className="tool-btn px-1 py-0.5"
                    title="下移"
                    aria-label={`把第 ${index + 1} 張投影片下移`}
                    disabled={index === slides.length - 1}
                    onClick={(e) => {
                      e.stopPropagation();
                      editorStore.moveSlide(slide.id, 1);
                    }}
                  >
                    <Icon name="down" size={13} />
                  </button>
                  <button
                    type="button"
                    className="tool-btn px-1 py-0.5"
                    title="複製投影片"
                    aria-label={`複製第 ${index + 1} 張投影片`}
                    onClick={(e) => {
                      e.stopPropagation();
                      editorStore.duplicateSlide(slide.id);
                    }}
                  >
                    <Icon name="copy" size={13} />
                  </button>
                  <button
                    type="button"
                    className="tool-btn px-1 py-0.5"
                    title="刪除投影片"
                    aria-label={`刪除第 ${index + 1} 張投影片`}
                    style={{ color: 'var(--color-danger)' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      editorStore.requestDeleteSlide(slide.id);
                    }}
                  >
                    <Icon name="trash" size={13} />
                  </button>
                </div>
              </div>

              <Thumbnail slide={slide} />

              <div className="mt-1.5 flex items-center justify-between gap-1">
                <div className="truncate text-[11.5px]" title={slide.title}>
                  {slide.title}
                </div>
                {aiCount > 0 && (
                  <span
                    className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                    style={{
                      background: pendingCount
                        ? 'var(--color-brand-soft)'
                        : 'var(--color-ok-soft)',
                      color: pendingCount ? 'var(--color-brand)' : 'var(--color-ok)',
                    }}
                    title={`此頁有 ${aiCount} 個 AI 元件，其中 ${pendingCount} 個尚未完成`}
                  >
                    {pendingCount ? `✨ ${pendingCount}` : `✓ ${aiCount}`}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t px-3 py-2" style={{ borderColor: 'var(--color-line)' }}>
        <button
          type="button"
          className="tool-btn w-full justify-center"
          style={{ background: 'var(--color-panel-2)', border: '1px solid var(--color-line)' }}
          onClick={() =>
            editorStore.openDialog({ kind: 'layout', afterSlideId: state.currentSlideId })
          }
        >
          <Icon name="plus" size={14} />
          新增投影片
        </button>
      </div>
    </aside>
  );
}
