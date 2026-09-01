import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  allocateTaskId,
  createAiComponentElement,
  createEllipseElement,
  createImageElement,
  createLineElement,
  createRectElement,
  createTextElement,
} from '../model/factory';
import type { SlideElement, TextElement } from '../model/types';
import { editorStore, useEditorState, type ToolId } from '../store/editorStore';
import { pickImageFile } from '../lib/files';
import { suggestedFormat } from '../lib/labels';
import { ElementView, sortByZ } from './ElementView';

/** 畫布：真正的選取、拖曳、縮放、對齊與繪製，全部以指標事件實作。 */

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

interface DragState {
  kind: 'drag';
  startX: number;
  startY: number;
  originals: Map<string, { x: number; y: number; width: number; height: number }>;
}

interface ResizeState {
  kind: 'resize';
  handle: Handle;
  startX: number;
  startY: number;
  original: { x: number; y: number; width: number; height: number };
  elementId: string;
}

interface MarqueeState {
  kind: 'marquee';
  startX: number;
  startY: number;
  additive: boolean;
}

interface DrawState {
  kind: 'draw';
  startX: number;
  startY: number;
  tool: ToolId;
}

type Interaction = DragState | ResizeState | MarqueeState | DrawState | null;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const SNAP_THRESHOLD = 8;
const MIN_SIZE = 12;

function normalizeRect(x1: number, y1: number, x2: number, y2: number): Rect {
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
}

function intersects(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
  );
}

export function Canvas() {
  const state = useEditorState();
  const slide = state.presentation.slides.find((s) => s.id === state.currentSlideId);
  const { width, height } = state.presentation.settings;

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const interaction = useRef<Interaction>(null);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [drawing, setDrawing] = useState<Rect | null>(null);
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });

  const zoom = state.zoom;

  /* 自動縮放以符合視窗 ------------------------------------------------ */
  useLayoutEffect(() => {
    if (!state.fitToWindow) return;
    const el = wrapRef.current;
    if (!el) return;
    const compute = () => {
      const pad = 72;
      const k = Math.min(
        (el.clientWidth - pad) / width,
        (el.clientHeight - pad) / height,
      );
      if (Number.isFinite(k) && k > 0) editorStore.setFitZoom(k);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [state.fitToWindow, width, height, state.presentation.slides.length]);

  const toStage = useCallback(
    (clientX: number, clientY: number) => {
      const rect = stageRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return { x: (clientX - rect.left) / zoom, y: (clientY - rect.top) / zoom };
    },
    [zoom],
  );

  /* 吸附 -------------------------------------------------------------- */
  const snapTargets = useCallback(
    (movingIds: Set<string>) => {
      const xs = [0, width / 2, width];
      const ys = [0, height / 2, height];
      for (const el of slide?.elements ?? []) {
        if (movingIds.has(el.id) || el.hidden) continue;
        xs.push(el.x, el.x + el.width / 2, el.x + el.width);
        ys.push(el.y, el.y + el.height / 2, el.y + el.height);
      }
      return { xs, ys };
    },
    [slide, width, height],
  );

  const applySnap = useCallback(
    (rect: Rect, movingIds: Set<string>, enabled: boolean) => {
      if (!enabled) {
        setGuides({ x: [], y: [] });
        return { dx: 0, dy: 0 };
      }
      const { xs, ys } = snapTargets(movingIds);
      const threshold = SNAP_THRESHOLD / zoom;
      let dx = 0;
      let dy = 0;
      let bestX = threshold;
      let bestY = threshold;
      const hitX: number[] = [];
      const hitY: number[] = [];

      for (const edge of [rect.x, rect.x + rect.width / 2, rect.x + rect.width]) {
        for (const target of xs) {
          const delta = target - edge;
          if (Math.abs(delta) <= bestX) {
            bestX = Math.abs(delta);
            dx = delta;
            hitX.length = 0;
            hitX.push(target);
          }
        }
      }
      for (const edge of [rect.y, rect.y + rect.height / 2, rect.y + rect.height]) {
        for (const target of ys) {
          const delta = target - edge;
          if (Math.abs(delta) <= bestY) {
            bestY = Math.abs(delta);
            dy = delta;
            hitY.length = 0;
            hitY.push(target);
          }
        }
      }
      setGuides({ x: hitX, y: hitY });
      return { dx, dy };
    },
    [snapTargets, zoom],
  );

  /* 指標事件 ---------------------------------------------------------- */
  const onElementPointerDown = (e: React.PointerEvent, el: SlideElement) => {
    if (state.tool !== 'select') return;
    e.stopPropagation();
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    const alreadySelected = state.selectedIds.includes(el.id);
    if (!alreadySelected) editorStore.select([el.id], additive);
    else if (additive)
      editorStore.select(state.selectedIds.filter((id) => id !== el.id));

    if (el.locked) return;

    const ids = new Set(
      alreadySelected
        ? state.selectedIds
        : additive
          ? [...state.selectedIds, el.id]
          : [el.id],
    );
    const originals = new Map<string, { x: number; y: number; width: number; height: number }>();
    for (const item of slide?.elements ?? []) {
      if (ids.has(item.id) && !item.locked) {
        originals.set(item.id, {
          x: item.x,
          y: item.y,
          width: item.width,
          height: item.height,
        });
      }
    }
    const point = toStage(e.clientX, e.clientY);
    interaction.current = { kind: 'drag', startX: point.x, startY: point.y, originals };
    editorStore.beginTransaction();
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const onHandlePointerDown = (e: React.PointerEvent, handle: Handle, el: SlideElement) => {
    e.stopPropagation();
    const point = toStage(e.clientX, e.clientY);
    interaction.current = {
      kind: 'resize',
      handle,
      startX: point.x,
      startY: point.y,
      elementId: el.id,
      original: { x: el.x, y: el.y, width: el.width, height: el.height },
    };
    editorStore.beginTransaction();
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const onStagePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const point = toStage(e.clientX, e.clientY);
    if (state.tool === 'select') {
      editorStore.clearSelection();
      interaction.current = {
        kind: 'marquee',
        startX: point.x,
        startY: point.y,
        additive: e.shiftKey,
      };
      setMarquee({ x: point.x, y: point.y, width: 0, height: 0 });
    } else {
      interaction.current = {
        kind: 'draw',
        startX: point.x,
        startY: point.y,
        tool: state.tool,
      };
      setDrawing({ x: point.x, y: point.y, width: 0, height: 0 });
    }
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const current = interaction.current;
    if (!current) return;
    const point = toStage(e.clientX, e.clientY);
    const snapEnabled = state.snapEnabled && !e.altKey;

    if (current.kind === 'drag') {
      let dx = point.x - current.startX;
      let dy = point.y - current.startY;
      if (e.shiftKey) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      const ids = new Set(current.originals.keys());
      const bounds = [...current.originals.values()];
      const minX = Math.min(...bounds.map((b) => b.x)) + dx;
      const minY = Math.min(...bounds.map((b) => b.y)) + dy;
      const maxX = Math.max(...bounds.map((b) => b.x + b.width)) + dx;
      const maxY = Math.max(...bounds.map((b) => b.y + b.height)) + dy;
      const snap = applySnap(
        { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
        ids,
        snapEnabled,
      );
      editorStore.transient((draft) => {
        for (const s of draft.slides) {
          for (const el of s.elements) {
            const origin = current.originals.get(el.id);
            if (!origin) continue;
            el.x = Math.round(origin.x + dx + snap.dx);
            el.y = Math.round(origin.y + dy + snap.dy);
          }
        }
      });
      return;
    }

    if (current.kind === 'resize') {
      const { original, handle } = current;
      let dx = point.x - current.startX;
      let dy = point.y - current.startY;
      let next: Rect = { ...original };

      if (handle.includes('w')) {
        const w = original.width - dx;
        next.x = original.x + dx;
        next.width = w;
      }
      if (handle.includes('e')) next.width = original.width + dx;
      if (handle.includes('n')) {
        const h = original.height - dy;
        next.y = original.y + dy;
        next.height = h;
      }
      if (handle.includes('s')) next.height = original.height + dy;

      if (e.shiftKey && original.width > 0 && original.height > 0) {
        const ratio = original.width / original.height;
        if (handle === 'e' || handle === 'w') next.height = next.width / ratio;
        else if (handle === 'n' || handle === 's') next.width = next.height * ratio;
        else {
          next.height = next.width / ratio;
          if (handle.includes('n')) next.y = original.y + original.height - next.height;
        }
      }

      if (next.width < MIN_SIZE) {
        if (handle.includes('w')) next.x = original.x + original.width - MIN_SIZE;
        next.width = MIN_SIZE;
      }
      if (next.height < MIN_SIZE) {
        if (handle.includes('n')) next.y = original.y + original.height - MIN_SIZE;
        next.height = MIN_SIZE;
      }

      if (snapEnabled) {
        const snap = applySnap(next, new Set([current.elementId]), true);
        // 只吸附正在移動的那一側，避免整體漂移
        if (handle.includes('w')) next.x += snap.dx;
        if (handle.includes('e')) next.width += snap.dx;
        if (handle.includes('n')) next.y += snap.dy;
        if (handle.includes('s')) next.height += snap.dy;
        next.width = Math.max(MIN_SIZE, next.width);
        next.height = Math.max(MIN_SIZE, next.height);
      }

      const rounded = {
        x: Math.round(next.x),
        y: Math.round(next.y),
        width: Math.round(next.width),
        height: Math.round(next.height),
      };
      editorStore.updateElement(current.elementId, rounded, { transient: true });
      return;
    }

    if (current.kind === 'marquee') {
      setMarquee(normalizeRect(current.startX, current.startY, point.x, point.y));
      return;
    }

    if (current.kind === 'draw') {
      setDrawing(normalizeRect(current.startX, current.startY, point.x, point.y));
    }
  };

  const finishDraw = async (rect: Rect, tool: ToolId) => {
    const presentation = editorStore.getState().presentation;
    const small = rect.width < 8 || rect.height < 8;
    const box = small
      ? { x: Math.round(rect.x), y: Math.round(rect.y) }
      : {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };

    switch (tool) {
      case 'text':
        editorStore.addElement(
          createTextElement({ ...box, text: '輸入文字', ...(small ? { width: 640, height: 120 } : {}) }),
        );
        break;
      case 'rect':
        editorStore.addElement(createRectElement(box));
        break;
      case 'ellipse':
        editorStore.addElement(createEllipseElement(box));
        break;
      case 'line':
        editorStore.addElement(
          createLineElement({ ...box, ...(small ? { width: 600, height: 8 } : { height: 8 }) }),
        );
        break;
      case 'image': {
        const picked = await pickImageFile();
        editorStore.addElement(
          createImageElement({
            ...box,
            ...(small ? { width: 640, height: 400 } : {}),
            src: picked?.dataUrl ?? '',
            alt: picked?.name ?? '圖片',
          }),
        );
        if (!picked) {
          editorStore.toast({ tone: 'info', title: '尚未選擇圖片', detail: '可在右側屬性面板重新選擇。' });
        }
        break;
      }
      case 'ai_component': {
        const taskId = allocateTaskId(presentation);
        const el = createAiComponentElement({
          ...box,
          ...(small ? { width: 900, height: 500 } : {}),
          taskId,
          kind: 'chart',
          outputFormat: suggestedFormat('chart'),
          prompt: '',
        });
        editorStore.addElement(el);
        editorStore.toast({
          tone: 'info',
          title: `已建立 AI 元件（${taskId}）`,
          detail: '請在右側「AI 設定」填寫 Prompt，之後即可匯出 AI Package。',
        });
        break;
      }
      default:
        break;
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const current = interaction.current;
    interaction.current = null;
    setGuides({ x: [], y: [] });

    if (!current) return;

    if (current.kind === 'drag' || current.kind === 'resize') {
      editorStore.endTransaction();
      return;
    }

    if (current.kind === 'marquee') {
      const point = toStage(e.clientX, e.clientY);
      const rect = normalizeRect(current.startX, current.startY, point.x, point.y);
      setMarquee(null);
      if (rect.width < 4 && rect.height < 4) return;
      const hits = (slide?.elements ?? [])
        .filter((el) => !el.hidden && intersects(rect, el))
        .map((el) => el.id);
      editorStore.select(hits, current.additive);
      return;
    }

    if (current.kind === 'draw') {
      const point = toStage(e.clientX, e.clientY);
      const rect = normalizeRect(current.startX, current.startY, point.x, point.y);
      setDrawing(null);
      void finishDraw(rect, current.tool);
    }
  };

  /* 文字編輯 ---------------------------------------------------------- */
  const editing = slide?.elements.find(
    (el) => el.id === state.editingTextId && el.type === 'text',
  ) as TextElement | undefined;

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
      editorStore.beginTransaction();
    }
  }, [editing?.id]);

  if (!slide) {
    return (
      <div className="flex h-full items-center justify-center text-ink-3">
        尚未選擇投影片
      </div>
    );
  }

  const selected = slide.elements.filter((el) => state.selectedIds.includes(el.id));
  const single = selected.length === 1 ? selected[0] : null;
  const bounds =
    selected.length > 0
      ? {
          x: Math.min(...selected.map((el) => el.x)),
          y: Math.min(...selected.map((el) => el.y)),
          width:
            Math.max(...selected.map((el) => el.x + el.width)) -
            Math.min(...selected.map((el) => el.x)),
          height:
            Math.max(...selected.map((el) => el.y + el.height)) -
            Math.min(...selected.map((el) => el.y)),
        }
      : null;

  const handleSize = 9 / zoom;
  const handles: Array<{ id: Handle; x: number; y: number; cursor: string }> = single
    ? [
        { id: 'nw', x: single.x, y: single.y, cursor: 'nwse-resize' },
        { id: 'n', x: single.x + single.width / 2, y: single.y, cursor: 'ns-resize' },
        { id: 'ne', x: single.x + single.width, y: single.y, cursor: 'nesw-resize' },
        { id: 'e', x: single.x + single.width, y: single.y + single.height / 2, cursor: 'ew-resize' },
        {
          id: 'se',
          x: single.x + single.width,
          y: single.y + single.height,
          cursor: 'nwse-resize',
        },
        {
          id: 's',
          x: single.x + single.width / 2,
          y: single.y + single.height,
          cursor: 'ns-resize',
        },
        { id: 'sw', x: single.x, y: single.y + single.height, cursor: 'nesw-resize' },
        { id: 'w', x: single.x, y: single.y + single.height / 2, cursor: 'ew-resize' },
      ]
    : [];

  return (
    <div
      ref={wrapRef}
      className="relative h-full w-full overflow-auto"
      style={{ background: 'var(--color-stage)' }}
    >
      <div className="flex min-h-full min-w-full items-center justify-center p-9">
        <div
          ref={stageRef}
          className="relative shadow-2xl"
          style={{
            width,
            height,
            transform: `scale(${zoom})`,
            transformOrigin: 'center center',
            background: slide.background,
            cursor: state.tool === 'select' ? 'default' : 'crosshair',
            flex: '0 0 auto',
            margin: `${(height * zoom - height) / 2}px ${(width * zoom - width) / 2}px`,
          }}
          onPointerDown={onStagePointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {sortByZ(slide.elements).map((el) => (
            <div
              key={el.id}
              onPointerDown={(e) => onElementPointerDown(e, el)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                if (el.type === 'text' && !el.locked) editorStore.setEditingText(el.id);
              }}
              style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: el.x,
                  top: el.y,
                  width: el.width,
                  height: el.height,
                  pointerEvents: state.tool === 'select' && !el.hidden ? 'auto' : 'none',
                  cursor: el.locked ? 'not-allowed' : 'move',
                }}
              />
              <div style={{ pointerEvents: 'none' }}>
                <ElementView el={el} mode="edit" />
              </div>
            </div>
          ))}

          {/* 對齊輔助線 */}
          {state.showGuides &&
            guides.x.map((x) => (
              <div
                key={`gx-${x}`}
                style={{
                  position: 'absolute',
                  left: x,
                  top: 0,
                  width: 1 / zoom,
                  height,
                  background: 'var(--color-brand)',
                  pointerEvents: 'none',
                }}
              />
            ))}
          {state.showGuides &&
            guides.y.map((y) => (
              <div
                key={`gy-${y}`}
                style={{
                  position: 'absolute',
                  top: y,
                  left: 0,
                  height: 1 / zoom,
                  width,
                  background: 'var(--color-brand)',
                  pointerEvents: 'none',
                }}
              />
            ))}

          {/* 選取框 */}
          {bounds && (
            <div
              style={{
                position: 'absolute',
                left: bounds.x,
                top: bounds.y,
                width: bounds.width,
                height: bounds.height,
                outline: `${1.5 / zoom}px solid var(--color-brand)`,
                pointerEvents: 'none',
              }}
            />
          )}

          {handles.map((h) => (
            <div
              key={h.id}
              onPointerDown={(e) => single && onHandlePointerDown(e, h.id, single)}
              style={{
                position: 'absolute',
                left: h.x - handleSize / 2,
                top: h.y - handleSize / 2,
                width: handleSize,
                height: handleSize,
                background: '#fff',
                border: `${1.5 / zoom}px solid var(--color-brand)`,
                borderRadius: 2 / zoom,
                cursor: h.cursor,
                pointerEvents: single?.locked ? 'none' : 'auto',
              }}
            />
          ))}

          {/* 框選 */}
          {marquee && (
            <div
              style={{
                position: 'absolute',
                left: marquee.x,
                top: marquee.y,
                width: marquee.width,
                height: marquee.height,
                border: `${1 / zoom}px solid var(--color-brand)`,
                background: 'color-mix(in srgb, var(--color-brand) 12%, transparent)',
                pointerEvents: 'none',
              }}
            />
          )}

          {/* 繪製預覽 */}
          {drawing && (
            <div
              style={{
                position: 'absolute',
                left: drawing.x,
                top: drawing.y,
                width: drawing.width,
                height: drawing.height,
                border: `${2 / zoom}px dashed var(--color-brand)`,
                background: 'color-mix(in srgb, var(--color-brand) 8%, transparent)',
                pointerEvents: 'none',
              }}
            />
          )}

          {/* 文字直接編輯 */}
          {editing && (
            <textarea
              ref={textareaRef}
              defaultValue={editing.text}
              onChange={(e) =>
                editorStore.updateElement(editing.id, { text: e.target.value }, { transient: true })
              }
              onBlur={() => {
                editorStore.endTransaction();
                editorStore.setEditingText(null);
              }}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Escape') {
                  editorStore.endTransaction();
                  editorStore.setEditingText(null);
                }
              }}
              style={{
                position: 'absolute',
                left: editing.x,
                top: editing.y,
                width: editing.width,
                height: editing.height,
                fontSize: editing.fontSize,
                fontWeight: editing.bold ? 700 : 400,
                fontStyle: editing.italic ? 'italic' : 'normal',
                textAlign: editing.align,
                color: editing.color,
                lineHeight: editing.lineHeight,
                letterSpacing: editing.letterSpacing,
                background: 'rgba(255,255,255,.92)',
                border: `${2 / zoom}px solid var(--color-brand)`,
                outline: 'none',
                resize: 'none',
                padding: 0,
                fontFamily: 'inherit',
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
