import { editorStore, useEditorState } from '../store/editorStore';
import type { Slide } from '../model/types';
import { ElementView, sortByZ } from './ElementView';
import { Icon } from './Icon';

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
          onClick={() => editorStore.addSlide(state.currentSlideId)}
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
              className="group rounded-lg p-1.5 transition"
              style={{
                background: active ? 'var(--color-brand-soft)' : 'transparent',
                outline: active ? '1.5px solid var(--color-brand)' : '1px solid transparent',
              }}
              onClick={() => editorStore.selectSlide(slide.id)}
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[11px] font-bold text-ink-2">{index + 1}</span>
                <div className="flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                  <button
                    type="button"
                    className="tool-btn px-1 py-0.5"
                    title="上移"
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
                    style={{ color: 'var(--color-danger)' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      editorStore.deleteSlide(slide.id);
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
          onClick={() => editorStore.addSlide(state.currentSlideId)}
        >
          <Icon name="plus" size={14} />
          新增投影片
        </button>
      </div>
    </aside>
  );
}
