import { useCallback, useLayoutEffect, useRef, useState } from 'react';
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
import { Icon } from './Icon';

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
  originals: Map<string, SlideElement>;
  isGroup: boolean;
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 依群組外框的變化，同步換算一個成員的位置、大小與可縮放樣式。 */
export function scaleElementWithinBounds(
  element: SlideElement,
  from: Rect,
  to: Rect,
): SlideElement {
  const scaleX = from.width > 0 ? to.width / from.width : 1;
  const scaleY = from.height > 0 ? to.height / from.height : 1;
  const styleScale = Math.min(Math.abs(scaleX), Math.abs(scaleY));
  const copy = structuredClone(element);
  copy.x = Math.round(to.x + (element.x - from.x) * scaleX);
  copy.y = Math.round(to.y + (element.y - from.y) * scaleY);
  copy.width = Math.max(MIN_SIZE, Math.round(element.width * scaleX));
  copy.height = Math.max(MIN_SIZE, Math.round(element.height * scaleY));

  if (copy.type === 'text' && element.type === 'text') {
    copy.fontSize = Math.max(1, Math.round(element.fontSize * styleScale));
    copy.letterSpacing = Math.round(element.letterSpacing * styleScale * 100) / 100;
  } else if (copy.type === 'rect' && element.type === 'rect') {
    copy.strokeWidth = Math.round(element.strokeWidth * styleScale * 100) / 100;
    copy.radius = Math.round(element.radius * styleScale * 100) / 100;
  } else if (copy.type === 'ellipse' && element.type === 'ellipse') {
    copy.strokeWidth = Math.round(element.strokeWidth * styleScale * 100) / 100;
  } else if (copy.type === 'line' && element.type === 'line') {
    copy.strokeWidth = Math.max(1, Math.round(element.strokeWidth * styleScale * 100) / 100);
  } else if (copy.type === 'image' && element.type === 'image') {
    copy.radius = Math.round(element.radius * styleScale * 100) / 100;
  }
  return copy;
}

/** 把元素完整留在投影片內。 */
export function fitRectToCanvas(rect: Rect, canvasWidth: number, canvasHeight: number): Rect {
  const width = Math.min(canvasWidth, Math.max(MIN_SIZE, rect.width));
  const height = Math.min(canvasHeight, Math.max(MIN_SIZE, rect.height));
  return {
    x: clamp(rect.x, 0, Math.max(0, canvasWidth - width)),
    y: clamp(rect.y, 0, Math.max(0, canvasHeight - height)),
    width,
    height,
  };
}

/** 點一下新增時，優先找不會壓住現有內容的位置。 */
export function findOpenPlacement(
  preferred: Rect,
  canvasWidth: number,
  canvasHeight: number,
  elements: SlideElement[],
): Rect {
  const base = fitRectToCanvas(preferred, canvasWidth, canvasHeight);
  const blockers = elements.filter((el) => !el.hidden && !el.locked);
  const isOpen = (candidate: Rect) =>
    blockers.every(
      (el) =>
        !intersects(candidate, {
          x: el.x - 16,
          y: el.y - 16,
          width: el.width + 32,
          height: el.height + 32,
        }),
    );

  if (isOpen(base)) return base;

  const candidates: Rect[] = [];
  const step = 40;
  for (let y = 24; y <= canvasHeight - base.height; y += step) {
    for (let x = 24; x <= canvasWidth - base.width; x += step) {
      candidates.push({ ...base, x, y });
    }
  }
  candidates.sort(
    (a, b) =>
      Math.hypot(a.x - base.x, a.y - base.y) - Math.hypot(b.x - base.x, b.y - base.y),
  );
  return candidates.find(isOpen) ?? base;
}

/** 計算選取元素壓到幾個可編輯元素；鎖定背景不算。 */
export function countSelectedOverlaps(elements: SlideElement[], selectedIds: string[]): number {
  const selected = new Set(selectedIds);
  const hits = new Set<string>();
  for (const current of elements) {
    if (!selected.has(current.id) || current.hidden) continue;
    for (const other of elements) {
      if (
        selected.has(other.id) ||
        other.hidden ||
        other.locked ||
        current.id === other.id
      ) {
        continue;
      }
      if (intersects(current, other)) hits.add(other.id);
    }
  }
  return hits.size;
}

export function Canvas() {
  const state = useEditorState();
  const slide = state.presentation.slides.find((s) => s.id === state.currentSlideId);
  const { width, height } = state.presentation.settings;

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const interaction = useRef<Interaction>(null);
  const pendingTextCaret = useRef<{ x: number; y: number } | null>(null);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [drawing, setDrawing] = useState<Rect | null>(null);
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });
  const [motionInfo, setMotionInfo] = useState<Rect | null>(null);

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
    const selectedIds =
      alreadySelected && !additive
        ? state.selectedIds
        : editorStore.selectElement(el.id, additive);

    if (el.locked) return;
    if (selectedIds.length === 0) return;

    const ids = new Set(selectedIds);
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

  const onHandlePointerDown = (
    e: React.PointerEvent,
    handle: Handle,
    targets: SlideElement[],
    original: Rect,
    isGroup: boolean,
  ) => {
    e.stopPropagation();
    const first = targets[0];
    if (!first) return;
    const point = toStage(e.clientX, e.clientY);
    interaction.current = {
      kind: 'resize',
      handle,
      startX: point.x,
      startY: point.y,
      elementId: first.id,
      original,
      originals: new Map(targets.map((el) => [el.id, structuredClone(el)])),
      isGroup,
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
      const baseMinX = Math.min(...bounds.map((b) => b.x));
      const baseMinY = Math.min(...bounds.map((b) => b.y));
      const baseMaxX = Math.max(...bounds.map((b) => b.x + b.width));
      const baseMaxY = Math.max(...bounds.map((b) => b.y + b.height));
      dx = clamp(dx, -baseMinX, width - baseMaxX);
      dy = clamp(dy, -baseMinY, height - baseMaxY);
      const minX = baseMinX + dx;
      const minY = baseMinY + dy;
      const maxX = baseMaxX + dx;
      const maxY = baseMaxY + dy;
      const snap = applySnap(
        { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
        ids,
        snapEnabled,
      );
      const totalDx = clamp(dx + snap.dx, -baseMinX, width - baseMaxX);
      const totalDy = clamp(dy + snap.dy, -baseMinY, height - baseMaxY);
      setMotionInfo({
        x: Math.round(baseMinX + totalDx),
        y: Math.round(baseMinY + totalDy),
        width: Math.round(baseMaxX - baseMinX),
        height: Math.round(baseMaxY - baseMinY),
      });
      editorStore.transient((draft) => {
        for (const s of draft.slides) {
          for (const el of s.elements) {
            const origin = current.originals.get(el.id);
            if (!origin) continue;
            el.x = Math.round(origin.x + totalDx);
            el.y = Math.round(origin.y + totalDy);
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

      if ((current.isGroup || e.shiftKey) && original.width > 0 && original.height > 0) {
        const ratio = original.width / original.height;
        const scaleX = next.width / original.width;
        const scaleY = next.height / original.height;
        let scale =
          Math.abs(scaleX - 1) >= Math.abs(scaleY - 1) ? scaleX : scaleY;

        if (current.isGroup) {
          const minScale = Math.max(
            0.01,
            ...[...current.originals.values()].flatMap((el) => [
              MIN_SIZE / el.width,
              MIN_SIZE / el.height,
            ]),
          );
          const anchorX = handle.includes('w') ? original.x + original.width : original.x;
          const anchorY = handle.includes('n') ? original.y + original.height : original.y;
          const maxWidth = handle.includes('w') ? anchorX : width - anchorX;
          const maxHeight = handle.includes('n') ? anchorY : height - anchorY;
          scale = clamp(
            scale,
            minScale,
            Math.max(minScale, Math.min(maxWidth / original.width, maxHeight / original.height)),
          );
        }

        next.width = original.width * scale;
        next.height = next.width / ratio;
        next.x = handle.includes('w') ? original.x + original.width - next.width : original.x;
        next.y = handle.includes('n') ? original.y + original.height - next.height : original.y;
      }

      if (next.width < MIN_SIZE) {
        if (handle.includes('w')) next.x = original.x + original.width - MIN_SIZE;
        next.width = MIN_SIZE;
      }
      if (next.height < MIN_SIZE) {
        if (handle.includes('n')) next.y = original.y + original.height - MIN_SIZE;
        next.height = MIN_SIZE;
      }

      if (snapEnabled && !current.isGroup) {
        const snap = applySnap(next, new Set([current.elementId]), true);
        // 只吸附正在移動的那一側，避免整體漂移
        if (handle.includes('w')) next.x += snap.dx;
        if (handle.includes('e')) next.width += snap.dx;
        if (handle.includes('n')) next.y += snap.dy;
        if (handle.includes('s')) next.height += snap.dy;
        next.width = Math.max(MIN_SIZE, next.width);
        next.height = Math.max(MIN_SIZE, next.height);
      }

      const fitted = fitRectToCanvas(next, width, height);
      const rounded = {
        x: Math.round(fitted.x),
        y: Math.round(fitted.y),
        width: Math.round(fitted.width),
        height: Math.round(fitted.height),
      };
      setMotionInfo(rounded);
      if (current.isGroup) {
        editorStore.transient((draft) => {
          for (const currentSlide of draft.slides) {
            for (const el of currentSlide.elements) {
              const source = current.originals.get(el.id);
              if (!source) continue;
              Object.assign(el, scaleElementWithinBounds(source, original, rounded));
            }
          }
        });
      } else {
        editorStore.updateElement(current.elementId, rounded, { transient: true });
      }
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
    const placement = (defaultWidth: number, defaultHeight: number): Rect => {
      const preferred = small
        ? { x: rect.x, y: rect.y, width: defaultWidth, height: defaultHeight }
        : rect;
      const fitted = small
        ? findOpenPlacement(preferred, width, height, slide?.elements ?? [])
        : fitRectToCanvas(preferred, width, height);
      return {
        x: Math.round(fitted.x),
        y: Math.round(fitted.y),
        width: Math.round(fitted.width),
        height: Math.round(fitted.height),
      };
    };

    switch (tool) {
      case 'text':
        {
          const box = placement(640, 120);
          const el = createTextElement({
            ...box,
            text: '',
          });
          editorStore.addElement(el);
          editorStore.setEditingText(el.id);
        }
        break;
      case 'rect':
        editorStore.addElement(createRectElement(placement(500, 300)));
        break;
      case 'ellipse':
        editorStore.addElement(createEllipseElement(placement(360, 240)));
        break;
      case 'line':
        editorStore.addElement(createLineElement({ ...placement(600, 12), height: 8 }));
        break;
      case 'image': {
        const picked = await pickImageFile();
        if (!picked) {
          editorStore.toast({
            tone: 'info',
            title: '已取消選擇圖片',
            detail: '畫布不會留下空白圖片框。',
          });
          break;
        }
        editorStore.addElement(
          createImageElement({
            ...placement(640, 400),
            src: picked.dataUrl,
            alt: picked.name,
          }),
        );
        break;
      }
      case 'ai_component': {
        const taskId = allocateTaskId(presentation);
        const el = createAiComponentElement({
          ...placement(900, 500),
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
    setMotionInfo(null);

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

  const editableRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const editable = editableRef.current;
    if (editing && editable) {
      editable.innerText = editing.text;
      editable.focus({ preventScroll: true });
      const point = pendingTextCaret.current;
      const selection = window.getSelection();
      if (selection) {
        const range = document.createRange();
        const caret = point ? document.caretPositionFromPoint?.(point.x, point.y) : null;
        if (caret && editable.contains(caret.offsetNode)) {
          range.setStart(caret.offsetNode, caret.offset);
        } else {
          range.selectNodeContents(editable);
          range.collapse(false);
        }
        selection.removeAllRanges();
        selection.addRange(range);
      }
      pendingTextCaret.current = null;
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
  const selectedGroupIds = new Set(selected.flatMap((el) => (el.groupId ? [el.groupId] : [])));
  const overlapCount = countSelectedOverlaps(slide.elements, state.selectedIds);
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

  const singleGroupId =
    selected.length > 1 &&
    selectedGroupIds.size === 1 &&
    selected.every((el) => el.groupId === [...selectedGroupIds][0])
      ? [...selectedGroupIds][0]
      : null;
  const singleGroupName = singleGroupId
    ? selected.find((el) => el.groupId === singleGroupId)?.groupName?.trim() || '未命名群組'
    : null;
  const resizeBounds = single
    ? { x: single.x, y: single.y, width: single.width, height: single.height }
    : singleGroupId
      ? bounds
      : null;
  const resizeTargets = single ? [single] : singleGroupId ? selected : [];

  const handleSize = 9 / zoom;
  const allHandles: Array<{ id: Handle; x: number; y: number; cursor: string }> = resizeBounds
    ? [
        { id: 'nw', x: resizeBounds.x, y: resizeBounds.y, cursor: 'nwse-resize' },
        { id: 'n', x: resizeBounds.x + resizeBounds.width / 2, y: resizeBounds.y, cursor: 'ns-resize' },
        { id: 'ne', x: resizeBounds.x + resizeBounds.width, y: resizeBounds.y, cursor: 'nesw-resize' },
        { id: 'e', x: resizeBounds.x + resizeBounds.width, y: resizeBounds.y + resizeBounds.height / 2, cursor: 'ew-resize' },
        {
          id: 'se',
          x: resizeBounds.x + resizeBounds.width,
          y: resizeBounds.y + resizeBounds.height,
          cursor: 'nwse-resize',
        },
        {
          id: 's',
          x: resizeBounds.x + resizeBounds.width / 2,
          y: resizeBounds.y + resizeBounds.height,
          cursor: 'ns-resize',
        },
        { id: 'sw', x: resizeBounds.x, y: resizeBounds.y + resizeBounds.height, cursor: 'nesw-resize' },
        { id: 'w', x: resizeBounds.x, y: resizeBounds.y + resizeBounds.height / 2, cursor: 'ew-resize' },
      ]
    : [];
  const handles = singleGroupId
    ? allHandles.filter((handle) => ['nw', 'ne', 'se', 'sw'].includes(handle.id))
    : allHandles;

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
                if (el.type === 'text' && !el.locked) {
                  pendingTextCaret.current = { x: e.clientX, y: e.clientY };
                  editorStore.setEditingText(el.id);
                }
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
                outline: `${1.5 / zoom}px solid ${
                  overlapCount > 0 ? 'var(--color-danger)' : 'var(--color-brand)'
                }`,
                pointerEvents: 'none',
              }}
            />
          )}

          {bounds && selectedGroupIds.size > 0 && (
            <div
              className="rounded-md px-2 py-1 font-bold"
              role="status"
              style={{
                position: 'absolute',
                left: bounds.x,
                top: Math.max(0, bounds.y - 30 / zoom),
                transform: `scale(${1 / zoom})`,
                transformOrigin: 'bottom left',
                background: 'var(--color-brand)',
                color: 'var(--color-brand-ink)',
                fontSize: 11,
                pointerEvents: 'none',
                zIndex: 10001,
              }}
            >
              {singleGroupName
                ? `${singleGroupName} · ${selected.length} 個元件`
                : `${selectedGroupIds.size} 個群組 · ${selected.length} 個元件`}
            </div>
          )}

          {bounds && overlapCount > 0 && (
            <div
              className="rounded-md px-2 py-1 font-bold"
              role="status"
              style={{
                position: 'absolute',
                left: bounds.x,
                top: Math.min(height - 32 / zoom, bounds.y + bounds.height + 8 / zoom),
                transform: `scale(${1 / zoom})`,
                transformOrigin: 'top left',
                background: 'var(--color-danger)',
                color: '#fff',
                fontSize: 11,
                pointerEvents: 'none',
                zIndex: 10001,
              }}
            >
              重疊 {overlapCount} 個元件
            </div>
          )}

          {motionInfo && (
            <div
              className="rounded-md border bg-panel px-2 py-1 font-mono text-[11px] shadow-lg"
              aria-live="polite"
              style={{
                position: 'absolute',
                left: clamp(
                  motionInfo.x + motionInfo.width + 10 / zoom,
                  8 / zoom,
                  Math.max(8 / zoom, width - 210 / zoom),
                ),
                top: clamp(
                  motionInfo.y + motionInfo.height + 10 / zoom,
                  8 / zoom,
                  Math.max(8 / zoom, height - 30 / zoom),
                ),
                transform: `scale(${1 / zoom})`,
                transformOrigin: 'top left',
                borderColor: 'var(--color-line)',
                pointerEvents: 'none',
                zIndex: 10002,
              }}
            >
              X {motionInfo.x}　Y {motionInfo.y}　{motionInfo.width} × {motionInfo.height}
            </div>
          )}

          {handles.map((h) => (
            <button
              type="button"
              key={h.id}
              aria-label={`縮放${singleGroupName ?? '元件'}（${h.id}）`}
              data-resize-handle={h.id}
              onPointerDown={(e) =>
                resizeBounds &&
                onHandlePointerDown(e, h.id, resizeTargets, resizeBounds, Boolean(singleGroupId))
              }
              style={{
                position: 'absolute',
                left: h.x - handleSize / 2,
                top: h.y - handleSize / 2,
                width: handleSize,
                height: handleSize,
                background: '#fff',
                border: `${1.5 / zoom}px solid var(--color-brand)`,
                borderRadius: 2 / zoom,
                padding: 0,
                cursor: h.cursor,
                pointerEvents: resizeTargets.some((el) => el.locked) ? 'none' : 'auto',
              }}
            />
          ))}

          {/* 選取文字後就近顯示常用工具，不用一直移到右側面板 */}
          {single?.type === 'text' && !single.locked && !editing && (
            <div
              className="panel-card flex items-center gap-1 p-1.5 shadow-xl"
              aria-label="文字快速工具列"
              onPointerDown={(e) => e.stopPropagation()}
              style={{
                position: 'absolute',
                left: Math.max(8 / zoom, single.x),
                top: Math.max(8 / zoom, single.y - 50 / zoom),
                transform: `scale(${1 / zoom})`,
                transformOrigin: 'top left',
                zIndex: 10000,
              }}
            >
              <label className="flex items-center gap-1 px-1 text-[11px] text-ink-3">
                字級
                <input
                  type="number"
                  aria-label="浮動字級"
                  className="field-input h-7 w-16 px-2 py-0 text-[12px]"
                  min={1}
                  value={single.fontSize}
                  onFocus={() => editorStore.beginTransaction()}
                  onChange={(e) => {
                    const fontSize = Number(e.target.value);
                    if (Number.isFinite(fontSize) && fontSize > 0) {
                      editorStore.updateElement(single.id, { fontSize }, { transient: true });
                    }
                  }}
                  onBlur={() => editorStore.endTransaction()}
                />
              </label>
              <span className="mx-0.5 h-5 w-px bg-line" />
              {(
                [
                  ['bold', 'B', single.bold],
                  ['italic', 'I', single.italic],
                  ['underline', 'U', single.underline],
                ] as const
              ).map(([property, label, active]) => (
                <button
                  key={property}
                  type="button"
                  className="tool-btn h-7 w-7 justify-center px-0 font-bold"
                  data-active={active}
                  aria-label={property === 'bold' ? '粗體' : property === 'italic' ? '斜體' : '底線'}
                  onClick={() => editorStore.updateElement(single.id, { [property]: !active })}
                >
                  {label}
                </button>
              ))}
              <span className="mx-0.5 h-5 w-px bg-line" />
              {(
                [
                  ['left', 'align-left', '靠左對齊'],
                  ['center', 'align-center-x', '置中對齊'],
                  ['right', 'align-right', '靠右對齊'],
                ] as const
              ).map(([align, icon, label]) => (
                <button
                  key={align}
                  type="button"
                  className="tool-btn h-7 w-7 justify-center px-0"
                  data-active={single.align === align}
                  aria-label={label}
                  onClick={() => editorStore.updateElement(single.id, { align })}
                >
                  <Icon name={icon} size={14} />
                </button>
              ))}
              <label
                className="ml-0.5 flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border"
                style={{ borderColor: 'var(--color-line)' }}
                title="文字顏色"
              >
                <span
                  className="h-4 w-4 rounded-full border"
                  style={{ background: single.color, borderColor: 'var(--color-line)' }}
                />
                <input
                  type="color"
                  aria-label="文字顏色"
                  className="sr-only"
                  value={single.color}
                  onChange={(e) => editorStore.updateElement(single.id, { color: e.target.value })}
                />
              </label>
            </div>
          )}

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
            <div
              ref={editableRef}
              contentEditable
              suppressContentEditableWarning
              role="textbox"
              aria-label="直接編輯文字"
              aria-multiline="true"
              data-placeholder="輸入文字"
              onInput={(e) =>
                editorStore.updateElement(
                  editing.id,
                  { text: e.currentTarget.innerText.replace(/\r\n?/g, '\n') },
                  { transient: true },
                )
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
                fontFamily: editing.fontFamily,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                overflow: 'hidden',
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
