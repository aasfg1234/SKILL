import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  allocateTaskId,
  createAiComponentElement,
  createEllipseElement,
  createImageElement,
  createLineElement,
  createRectElement,
  createShapeElement,
  createChartElement,
  createTableElement,
  createTextElement,
} from '../model/factory';
import type { ImageElement, SlideElement, TableElement, TextElement } from '../model/types';
import {
  mergeCells,
  mergeCovering,
  resizeTableColumn,
  setTableCell,
  tableCellRects,
  unmergeCells,
} from '../model/table';
import { editorStore, useEditorState, type ToolId } from '../store/editorStore';
import { changeIndent } from '../model/textList';
import { readCaret, writeCaret } from '../lib/caret';
import { SlideNumber } from './SlideNumber';
import { CropOverlay } from './CropOverlay';
import { pickImageFile } from '../lib/files';
import {
  fitImageIntoSlide,
  measureImage,
  pickImageFromFiles,
  readImageAsDataUrl,
} from '../lib/images';
import { suggestedFormat } from '../lib/labels';
import { ElementView, sortByZ } from './ElementView';
import { LAYER } from '../lib/layers';
import { buildContextMenu, type ContextMenuItem } from '../lib/contextMenu';
import { Icon } from './Icon';
import { effectiveSlideBackground, masterForSlide } from '../model/master';

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

interface RotateState {
  kind: 'rotate';
  centerX: number;
  centerY: number;
  startAngle: number;
  originals: Map<string, SlideElement>;
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

type Interaction = DragState | ResizeState | RotateState | MarqueeState | DrawState | null;

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

function elementVisualBounds(element: SlideElement): Rect {
  const radians = (element.rotation * Math.PI) / 180;
  const visualWidth =
    Math.abs(element.width * Math.cos(radians)) +
    Math.abs(element.height * Math.sin(radians));
  const visualHeight =
    Math.abs(element.width * Math.sin(radians)) +
    Math.abs(element.height * Math.cos(radians));
  const centerX = element.x + element.width / 2;
  const centerY = element.y + element.height / 2;
  return {
    x: centerX - visualWidth / 2,
    y: centerY - visualHeight / 2,
    width: visualWidth,
    height: visualHeight,
  };
}

function elementsVisualBounds(elements: SlideElement[]): Rect | null {
  if (elements.length === 0) return null;
  const boxes = elements.map(elementVisualBounds);
  const minX = Math.min(...boxes.map((box) => box.x));
  const minY = Math.min(...boxes.map((box) => box.y));
  const maxX = Math.max(...boxes.map((box) => box.x + box.width));
  const maxY = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** 讓元素中心繞著群組中心旋轉，並同步增加元素本身的角度。 */
export function rotateElementAroundPoint(
  element: SlideElement,
  center: { x: number; y: number },
  degrees: number,
): SlideElement {
  const radians = (degrees * Math.PI) / 180;
  const sourceX = element.x + element.width / 2;
  const sourceY = element.y + element.height / 2;
  const dx = sourceX - center.x;
  const dy = sourceY - center.y;
  const nextCenterX = center.x + dx * Math.cos(radians) - dy * Math.sin(radians);
  const nextCenterY = center.y + dx * Math.sin(radians) + dy * Math.cos(radians);
  const copy = structuredClone(element);
  copy.x = Math.round(nextCenterX - element.width / 2);
  copy.y = Math.round(nextCenterY - element.height / 2);
  copy.rotation = Math.round((element.rotation + degrees) * 10) / 10;
  return copy;
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
  copy.width = Math.max(MIN_SIZE, Math.round(element.width * scaleX));
  copy.height = Math.max(MIN_SIZE, Math.round(element.height * scaleY));
  const sourceCenterX = element.x + element.width / 2;
  const sourceCenterY = element.y + element.height / 2;
  const nextCenterX = to.x + (sourceCenterX - from.x) * scaleX;
  const nextCenterY = to.y + (sourceCenterY - from.y) * scaleY;
  copy.x = Math.round(nextCenterX - copy.width / 2);
  copy.y = Math.round(nextCenterY - copy.height / 2);

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

/**
 * 文字內容超出方塊時，把方塊撐高到剛好容納。
 * 不會超出投影片底部；塞得下時高度不變。
 */
export function growTextHeight(
  rect: { y: number; height: number },
  contentHeight: number,
  canvasHeight: number,
): number {
  const room = Math.max(1, canvasHeight - rect.y);
  const wanted = Math.max(rect.height, Math.ceil(contentHeight));
  return Math.min(wanted, room);
}

interface CellRange {
  a: { row: number; col: number };
  b: { row: number; col: number };
}

/** 選取範圍涵蓋幾格。 */
function rangeSize(range: CellRange): number {
  return (
    (Math.abs(range.a.row - range.b.row) + 1) * (Math.abs(range.a.col - range.b.col) + 1)
  );
}

/** 這一格在不在選取範圍內。 */
function inCellRange(range: CellRange | null, row: number, col: number): boolean {
  if (!range || rangeSize(range) < 2) return false;
  return (
    row >= Math.min(range.a.row, range.b.row) &&
    row <= Math.max(range.a.row, range.b.row) &&
    col >= Math.min(range.a.col, range.b.col) &&
    col <= Math.max(range.a.col, range.b.col)
  );
}

/** 儲存格內容：統一換行字元，並去掉瀏覽器補在結尾的空行。 */
function normalizeCellText(value: string): string {
  return value.replace(/\r\n?/g, '\n').replace(/\n$/, '');
}

/** 滾輪縮放：往上一格放大一成，往下一格縮小一成。 */
export function zoomWithWheel(zoom: number, deltaY: number): number {
  const factor = deltaY < 0 ? 1.1 : 1 / 1.1;
  return Math.min(3, Math.max(0.05, zoom * factor));
}

/** 被壓住的比例：交集面積佔「被壓住那個元素」的幾成。 */
function coveredRatio(cover: Rect, target: Rect): number {
  const w = Math.min(cover.x + cover.width, target.x + target.width) - Math.max(cover.x, target.x);
  const h = Math.min(cover.y + cover.height, target.y + target.height) - Math.max(cover.y, target.y);
  if (w <= 0 || h <= 0) return 0;
  const area = target.width * target.height;
  return area > 0 ? (w * h) / area : 0;
}

/**
 * 只有「幾乎整個蓋住」才算壓住，這樣才不會一相交就警告。
 * 元件坐在整頁背景上、或兩個區塊邊角相碰，都是正常排版，不該跳警告。
 */
const OVERLAP_COVER_RATIO = 0.6;

/** 計算選取元素壓住幾個可編輯元素；鎖定背景不算。 */
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
      if (coveredRatio(current, other) >= OVERLAP_COVER_RATIO) hits.add(other.id);
    }
  }
  return hits.size;
}

export function Canvas() {
  const state = useEditorState();
  const regularSlide = state.presentation.slides.find((s) => s.id === state.currentSlideId);
  const regularSlideIndex = state.presentation.slides.findIndex((s) => s.id === state.currentSlideId);
  const selectedMaster = state.masterMode
    ? state.presentation.masters?.[state.masterMode]
    : undefined;
  const slide = selectedMaster ?? regularSlide;
  // 正在拖框裁切的圖片；不是圖片或不在這一頁就當作沒有在裁切。
  const cropping = state.croppingId
    ? (slide?.elements.find(
        (el) => el.id === state.croppingId && el.type === 'image',
      ) as ImageElement | undefined)
    : undefined;
  const master = regularSlide && regularSlideIndex >= 0
    ? masterForSlide(state.presentation, regularSlide, regularSlideIndex)
    : undefined;
  const { width, height } = state.presentation.settings;

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const pageWheel = useRef({ delta: 0, lastChangeAt: 0 });
  const stageRef = useRef<HTMLDivElement | null>(null);
  const interaction = useRef<Interaction>(null);
  const pendingTextCaret = useRef<{ x: number; y: number } | null>(null);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [drawing, setDrawing] = useState<Rect | null>(null);
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });
  const [motionInfo, setMotionInfo] = useState<(Rect & { rotation?: number }) | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);
  const spaceHeld = useRef(false);
  const [dropping, setDropping] = useState(false);
  const pendingTableCell = useRef<{ row: number; col: number } | null>(null);
  const colResize = useRef<{ table: TableElement; at: number; startX: number } | null>(null);
  const [cellRange, setCellRange] = useState<{
    a: { row: number; col: number };
    b: { row: number; col: number };
  } | null>(null);

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
    let frameId: number | null = null;
    const scheduleCompute = () => {
      if (frameId !== null) return;
      frameId = requestAnimationFrame(() => {
        frameId = null;
        compute();
      });
    };
    compute();
    const ro = new ResizeObserver(scheduleCompute);
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (frameId !== null) cancelAnimationFrame(frameId);
    };
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

  const onRotatePointerDown = (
    e: React.PointerEvent,
    targets: SlideElement[],
    groupBounds: Rect,
  ) => {
    e.stopPropagation();
    const point = toStage(e.clientX, e.clientY);
    const centerX = groupBounds.x + groupBounds.width / 2;
    const centerY = groupBounds.y + groupBounds.height / 2;
    interaction.current = {
      kind: 'rotate',
      centerX,
      centerY,
      startAngle: Math.atan2(point.y - centerY, point.x - centerX),
      originals: new Map(targets.map((el) => [el.id, structuredClone(el)])),
    };
    editorStore.beginTransaction();
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  // Ctrl + 滾輪縮放；一般滾輪換頁。原生事件可確實擋下瀏覽器的預設捲動。
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        pageWheel.current.delta = 0;
        editorStore.setZoom(zoomWithWheel(editorStore.getState().zoom, e.deltaY));
        return;
      }
      if (editorStore.getState().editingTextId) return;

      const now = Date.now();
      if (now - pageWheel.current.lastChangeAt < 450) return;
      const unit = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : e.deltaMode === WheelEvent.DOM_DELTA_PAGE ? wrap.clientHeight : 1;
      pageWheel.current.delta += (Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX) * unit;
      if (Math.abs(pageWheel.current.delta) < 40) return;

      const direction = pageWheel.current.delta > 0 ? 1 : -1;
      pageWheel.current.delta = 0;
      if (editorStore.navigateSlide(direction)) pageWheel.current.lastChangeAt = now;
    };
    wrap.addEventListener('wheel', onWheel, { passive: false });
    return () => wrap.removeEventListener('wheel', onWheel);
  }, []);

  // 按住空白鍵拖曳，或用滑鼠中鍵拖曳，都可以平移畫布。
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const isTyping = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      if (!el) return false;
      return (
        el.tagName === 'INPUT' ||
        el.tagName === 'TEXTAREA' ||
        el.tagName === 'SELECT' ||
        el.isContentEditable
      );
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || isTyping(e.target)) return;
      spaceHeld.current = true;
      wrap.style.cursor = 'grab';
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      spaceHeld.current = false;
      wrap.style.cursor = '';
    };

    let panning: { x: number; y: number; left: number; top: number } | null = null;

    const onDown = (e: PointerEvent) => {
      if (e.button !== 1 && !(e.button === 0 && spaceHeld.current)) return;
      e.preventDefault();
      panning = { x: e.clientX, y: e.clientY, left: wrap.scrollLeft, top: wrap.scrollTop };
      wrap.style.cursor = 'grabbing';
      wrap.setPointerCapture?.(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!panning) return;
      wrap.scrollLeft = panning.left - (e.clientX - panning.x);
      wrap.scrollTop = panning.top - (e.clientY - panning.y);
    };
    const onUp = () => {
      if (!panning) return;
      panning = null;
      wrap.style.cursor = spaceHeld.current ? 'grab' : '';
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    wrap.addEventListener('pointerdown', onDown);
    wrap.addEventListener('pointermove', onMove);
    wrap.addEventListener('pointerup', onUp);
    wrap.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      wrap.removeEventListener('pointerdown', onDown);
      wrap.removeEventListener('pointermove', onMove);
      wrap.removeEventListener('pointerup', onUp);
      wrap.removeEventListener('pointercancel', onUp);
    };
  }, []);

  /** 把一個圖片檔放進目前這張投影片。point 是投影片座標，沒給就放正中間。 */
  const insertImageFile = useCallback(
    async (file: File, point?: { x: number; y: number }) => {
      const dataUrl = await readImageAsDataUrl(file);
      if (!dataUrl) {
        editorStore.toast({ tone: 'error', title: '讀不到這個圖片檔' });
        return;
      }
      const size = fitImageIntoSlide(await measureImage(dataUrl), { width, height });
      const placed = fitRectToCanvas(
        point
          ? { x: point.x - size.width / 2, y: point.y - size.height / 2, ...size }
          : { x: (width - size.width) / 2, y: (height - size.height) / 2, ...size },
        width,
        height,
      );
      editorStore.addElement(
        createImageElement({ ...placed, src: dataUrl, alt: file.name, fit: 'contain' }),
      );
      editorStore.toast({ tone: 'success', title: '已插入圖片', detail: file.name });
    },
    [width, height],
  );

  // 從系統剪貼簿貼上圖片（截圖後直接 Ctrl+V）。
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (editorStore.getState().editingTextId) return;
      const file = pickImageFromFiles(e.clipboardData?.files ?? null);
      if (!file) return;
      e.preventDefault();
      void insertImageFile(file);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [insertImageFile]);

  const onDragOver = (e: React.DragEvent) => {
    if (!Array.from(e.dataTransfer.types ?? []).includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDropping(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDropping(false);
  };

  const onDrop = (e: React.DragEvent) => {
    const file = pickImageFromFiles(e.dataTransfer.files);
    if (!file) {
      if (Array.from(e.dataTransfer.types ?? []).includes('Files')) {
        e.preventDefault();
        setDropping(false);
        editorStore.toast({ tone: 'warning', title: '只能拖曳圖片檔進來' });
      }
      return;
    }
    e.preventDefault();
    setDropping(false);
    void insertImageFile(file, toStage(e.clientX, e.clientY));
  };

  /** 拖曳表格的欄線調整欄寬。 */
  const onColumnResizeDown = (e: React.PointerEvent, table: TableElement, at: number) => {
    e.stopPropagation();
    if (table.locked) return;
    colResize.current = { table, at, startX: toStage(e.clientX, e.clientY).x };
    editorStore.beginTransaction();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };

  const onColumnResizeMove = (e: React.PointerEvent) => {
    const current = colResize.current;
    if (!current) return;
    const delta = (toStage(e.clientX, e.clientY).x - current.startX) / current.table.width;
    const next = resizeTableColumn(current.table, current.at, delta);
    editorStore.updateElement(
      current.table.id,
      { columnWidths: next.columnWidths },
      { transient: true },
    );
  };

  const onColumnResizeUp = () => {
    if (!colResize.current) return;
    colResize.current = null;
    editorStore.endTransaction();
  };

  const openContextMenu = (e: React.MouseEvent, element?: SlideElement) => {
    e.preventDefault();
    e.stopPropagation();
    const store = editorStore.getState();
    if (element) {
      if (!store.selectedIds.includes(element.id)) editorStore.selectElement(element.id);
    } else {
      editorStore.clearSelection();
    }
    const next = editorStore.getState();
    const chosen = editorStore.selectedElements();
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: buildContextMenu({
        hasSelection: next.selectedIds.length > 0,
        selectedCount: next.selectedIds.length,
        canPaste: editorStore.canPaste(),
        canUngroup: chosen.some((item) => item.groupId),
        locked: chosen.some((item) => item.locked),
        hasElements: (slide?.elements.length ?? 0) > 0,
      }),
    });
  };

  const runContextMenu = (id: string) => {
    setMenu(null);
    const chosen = editorStore.selectedElements();
    switch (id) {
      case 'copy':
        editorStore.copySelection();
        break;
      case 'paste':
        editorStore.paste();
        break;
      case 'duplicate':
        editorStore.duplicateSelected();
        break;
      case 'bring-front':
        editorStore.reorder('front');
        break;
      case 'send-back':
        editorStore.reorder('back');
        break;
      case 'group':
        editorStore.groupSelected();
        break;
      case 'ungroup':
        editorStore.ungroupSelected();
        break;
      case 'lock':
        editorStore.updateSelected({ locked: !chosen.some((item) => item.locked) });
        break;
      case 'delete':
        editorStore.deleteSelected();
        break;
      case 'select-all':
        editorStore.select((slide?.elements ?? []).map((item) => item.id));
        break;
      default:
        break;
    }
  };

  // 選單開著時，點別處或按 Esc 就關掉。
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null);
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
    };
  }, [menu]);

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
          const surfaces = draft.masters
            ? [draft.masters.cover, draft.masters.content, ...draft.slides]
            : draft.slides;
          for (const currentSlide of surfaces) {
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

    if (current.kind === 'rotate') {
      const angle = Math.atan2(point.y - current.centerY, point.x - current.centerX);
      let degrees = ((angle - current.startAngle) * 180) / Math.PI;
      if (e.shiftKey) degrees = Math.round(degrees / 15) * 15;
      degrees = Math.round(degrees * 10) / 10;
      const rotated = [...current.originals.values()].map((source) =>
        rotateElementAroundPoint(source, { x: current.centerX, y: current.centerY }, degrees),
      );
      const rotatedBounds = elementsVisualBounds(rotated);
      if (rotatedBounds) setMotionInfo({ ...rotatedBounds, rotation: degrees });
      const byId = new Map(rotated.map((el) => [el.id, el]));
      editorStore.transient((draft) => {
        const surfaces = draft.masters
          ? [draft.masters.cover, draft.masters.content, ...draft.slides]
          : draft.slides;
        for (const currentSlide of surfaces) {
          for (const el of currentSlide.elements) {
            const next = byId.get(el.id);
            if (next) Object.assign(el, next);
          }
        }
      });
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
      case 'table':
        editorStore.addElement(createTableElement({ ...placement(1200, 360), rows: 3, columns: 3 }));
        break;
      case 'chart':
        editorStore.addElement(createChartElement(placement(900, 520)));
        break;
      case 'ellipse':
        editorStore.addElement(createEllipseElement(placement(360, 240)));
        break;
      case 'shape':
        editorStore.addElement(
          createShapeElement({
            ...placement(320, 280),
            shape: editorStore.getState().shapeKind,
          }),
        );
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

    if (current.kind === 'drag' || current.kind === 'resize' || current.kind === 'rotate') {
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

  const editingTable = slide?.elements.find(
    (el) => el.id === state.editingTextId && el.type === 'table',
  ) as TableElement | undefined;

  useEffect(() => {
    if (!editingTable) setCellRange(null);
  }, [editingTable]);

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
  const bounds = elementsVisualBounds(selected);
  const selectedOutOfBounds = Boolean(
    bounds &&
      (bounds.x < 0 || bounds.y < 0 || bounds.x + bounds.width > width || bounds.y + bounds.height > height),
  );

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
  const rotateHandle =
    singleGroupId && bounds
      ? {
          x: bounds.x + bounds.width / 2,
          anchorY: bounds.y > 80 / zoom ? bounds.y : bounds.y + bounds.height,
          y:
            bounds.y > 80 / zoom
              ? bounds.y - 48 / zoom
              : bounds.y + bounds.height + 48 / zoom,
        }
      : null;

  return (
    <div
      ref={wrapRef}
      className="relative h-full w-full overflow-auto"
      style={{ background: 'var(--color-stage)' }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {state.masterMode && (
        <div
          className="pointer-events-none absolute left-4 top-4 rounded-lg border px-3 py-2 text-[12px] font-bold shadow-sm"
          style={{
            zIndex: LAYER.canvasBadge,
            borderColor: 'var(--color-brand)',
            background: 'var(--color-brand-soft)',
            color: 'var(--color-brand)',
          }}
        >
          {state.masterMode === 'cover' ? '封面母片' : '內容母片'}　新增的內容會顯示在套用這張母片的投影片
        </div>
      )}
      <div className="flex min-h-full min-w-full items-center justify-center p-9">
        <div
          ref={stageRef}
          className="relative shadow-2xl"
          style={{
            width,
            height,
            transform: `scale(${zoom})`,
            transformOrigin: 'center center',
            background: state.masterMode || !regularSlide || regularSlideIndex < 0
              ? slide.background
              : effectiveSlideBackground(state.presentation, regularSlide, regularSlideIndex),
            fontFamily: state.presentation.theme.fontFamily,
            cursor: state.tool === 'select' ? 'default' : 'crosshair',
            flex: '0 0 auto',
            margin: `${(height * zoom - height) / 2}px ${(width * zoom - width) / 2}px`,
          }}
          onPointerDown={onStagePointerDown}
          onContextMenu={(e) => openContextMenu(e)}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {!state.masterMode && master && (
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
              {sortByZ(master.elements).map((el) => (
                <ElementView key={`master-${el.id}`} el={el} mode="present" />
              ))}
            </div>
          )}
          {sortByZ(slide.elements).map((el) => (
            <div
              key={el.id}
              onPointerDown={(e) => onElementPointerDown(e, el)}
              onContextMenu={(e) => openContextMenu(e, el)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                if (el.type === 'image' && !el.locked) {
                  // 雙擊圖片直接進入拖框裁切。
                  editorStore.startCrop(el.id);
                  return;
                }
                if ((el.type === 'text' || el.type === 'table') && !el.locked) {
                  pendingTextCaret.current = { x: e.clientX, y: e.clientY };
                  if (el.type === 'table') {
                    // 雙擊哪一格就編輯哪一格，不用再點一次。
                    const point = toStage(e.clientX, e.clientY);
                    const hit = tableCellRects(el).find(
                      (cell) =>
                        point.x >= el.x + cell.x &&
                        point.x <= el.x + cell.x + cell.width &&
                        point.y >= el.y + cell.y &&
                        point.y <= el.y + cell.y + cell.height,
                    );
                    pendingTableCell.current = hit ? { row: hit.row, col: hit.col } : { row: 0, col: 0 };
                  }
                  editorStore.beginTransaction();
                  editorStore.setEditingText(el.id);
                }
              }}
              style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1 }}
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

          {!state.masterMode && (
            <SlideNumber presentation={state.presentation} index={regularSlideIndex} />
          )}

          {cropping && <CropOverlay el={cropping} zoom={zoom} />}

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
                  zIndex: LAYER.canvasOverlay,
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
                  zIndex: LAYER.canvasOverlay,
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
                zIndex: LAYER.canvasOverlay,
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
                zIndex: LAYER.canvasBadge,
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
                zIndex: LAYER.canvasBadge,
              }}
            >
              重疊 {overlapCount} 個元件
            </div>
          )}

          {bounds && selectedOutOfBounds && (
            <div
              className="rounded-md px-2 py-1 font-bold"
              role="status"
              style={{
                position: 'absolute',
                left: bounds.x,
                top: Math.min(
                  height - 32 / zoom,
                  bounds.y + bounds.height + (overlapCount > 0 ? 40 : 8) / zoom,
                ),
                transform: `scale(${1 / zoom})`,
                transformOrigin: 'top left',
                background: '#B45309',
                color: '#fff',
                fontSize: 11,
                pointerEvents: 'none',
                zIndex: LAYER.canvasBadge,
              }}
            >
              群組超出投影片
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
                zIndex: LAYER.canvasMotion,
              }}
            >
              {motionInfo.rotation === undefined
                ? `X ${Math.round(motionInfo.x)}　Y ${Math.round(motionInfo.y)}　${Math.round(motionInfo.width)} × ${Math.round(motionInfo.height)}`
                : `旋轉 ${motionInfo.rotation}°${motionInfo.rotation % 15 === 0 ? '　已吸附 15°' : ''}`}
            </div>
          )}

          {rotateHandle && bounds && (
            <>
              <div
                style={{
                  position: 'absolute',
                  left: rotateHandle.x,
                  top: Math.min(rotateHandle.anchorY, rotateHandle.y),
                  width: 1 / zoom,
                  height: Math.abs(rotateHandle.y - rotateHandle.anchorY),
                  background: 'var(--color-brand)',
                  pointerEvents: 'none',
                }}
              />
              <button
                type="button"
                aria-label={`旋轉${singleGroupName}`}
                data-rotate-handle="group"
                onPointerDown={(event) => onRotatePointerDown(event, selected, bounds)}
                style={{
                  position: 'absolute',
                  left: rotateHandle.x - 7 / zoom,
                  top: rotateHandle.y - 7 / zoom,
                  width: 14 / zoom,
                  height: 14 / zoom,
                  padding: 0,
                  borderRadius: '50%',
                  border: `${2 / zoom}px solid var(--color-brand)`,
                  background: '#fff',
                  cursor: 'grab',
                  pointerEvents: selected.some((el) => el.locked) ? 'none' : 'auto',
                }}
              />
            </>
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

          {/* 表格的欄線：拖曳可調整欄寬 */}
          {single?.type === 'table' &&
            !single.locked &&
            !editingTable &&
            single.columnWidths.slice(0, -1).map((_, at) => {
              const left =
                single.x +
                single.columnWidths.slice(0, at + 1).reduce((sum, w) => sum + w, 0) *
                  single.width;
              return (
                <div
                  key={`col-${at}`}
                  role="separator"
                  aria-label={`調整第 ${at + 1} 欄的寬度`}
                  onPointerDown={(e) => onColumnResizeDown(e, single, at)}
                  onPointerMove={onColumnResizeMove}
                  onPointerUp={onColumnResizeUp}
                  onPointerCancel={onColumnResizeUp}
                  style={{
                    position: 'absolute',
                    left: left - 5 / zoom,
                    top: single.y,
                    width: 10 / zoom,
                    height: single.height,
                    cursor: 'col-resize',
                    background: 'transparent',
                    zIndex: LAYER.canvasOverlay,
                  }}
                />
              );
            })}

          {/* 選取或編輯文字時都就近顯示常用工具，不用一直移到右側面板 */}
          {single?.type === 'text' && !single.locked && (
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
                zIndex: LAYER.canvasOverlay,
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
                zIndex: LAYER.canvasOverlay,
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

          {/* 表格儲存格直接編輯 */}
          {editingTable &&
            tableCellRects(editingTable).map((cell) => (
              <div
                key={`${cell.row}-${cell.col}`}
                contentEditable
                suppressContentEditableWarning
                role="textbox"
                aria-label={`第 ${cell.row + 1} 列第 ${cell.col + 1} 欄`}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  const here = { row: cell.row, col: cell.col };
                  setCellRange((prev) =>
                    e.shiftKey && prev ? { a: prev.a, b: here } : { a: here, b: here },
                  );
                }}
                onInput={(e) =>
                  editorStore.updateElement(
                    editingTable.id,
                    {
                      cells: setTableCell(
                        editingTable,
                        cell.row,
                        cell.col,
                        normalizeCellText(e.currentTarget.innerText),
                      ).cells,
                    },
                    { transient: true },
                  )
                }
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Escape') {
                    editorStore.endTransaction();
                    editorStore.setEditingText(null);
                  }
                }}
                style={{
                  position: 'absolute',
                  left: editingTable.x + cell.x,
                  top: editingTable.y + cell.y,
                  width: cell.width,
                  height: cell.height,
                  padding: editingTable.cellPadding,
                  display: 'flex',
                  alignItems: 'center',
                  fontSize: editingTable.fontSize,
                  fontWeight: editingTable.headerRow && cell.row === 0 ? 700 : 400,
                  color: editingTable.color,
                  fontFamily: editingTable.fontFamily,
                  background: inCellRange(cellRange, cell.row, cell.col)
                    ? 'color-mix(in srgb, var(--color-brand) 16%, #fff)'
                    : 'rgba(255,255,255,.94)',
                  border: `${1.5 / zoom}px solid var(--color-brand)`,
                  outline: 'none',
                  overflow: 'hidden',
                  wordBreak: 'break-word',
                }}
                ref={(node) => {
                  if (!node) return;
                  if (node.innerText !== editingTable.cells[cell.row][cell.col]) {
                    node.innerText = editingTable.cells[cell.row][cell.col];
                  }
                  const pending = pendingTableCell.current;
                  if (pending && pending.row === cell.row && pending.col === cell.col) {
                    pendingTableCell.current = null;
                    node.focus({ preventScroll: true });
                    const range = document.createRange();
                    range.selectNodeContents(node);
                    range.collapse(false);
                    const selection = window.getSelection();
                    selection?.removeAllRanges();
                    selection?.addRange(range);
                  }
                }}
              />
            ))}

          {/* 表格合併工具列 */}
          {editingTable && (
            <div
              className="panel-card flex items-center gap-1 p-1.5 shadow-xl"
              style={{
                position: 'absolute',
                left: editingTable.x,
                top: Math.max(8 / zoom, editingTable.y - 52 / zoom),
                transform: `scale(${1 / zoom})`,
                transformOrigin: 'top left',
                zIndex: LAYER.canvasOverlay,
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <span className="px-1 text-[11px] text-ink-3">
                {cellRange && rangeSize(cellRange) > 1
                  ? `已選 ${rangeSize(cellRange)} 格`
                  : '按住 Shift 點另一格可選範圍'}
              </span>
              <button
                type="button"
                className="tool-btn px-2 py-1 text-[11px]"
                disabled={!cellRange || rangeSize(cellRange) < 2}
                onClick={() => {
                  if (!cellRange) return;
                  const next = mergeCells(editingTable, cellRange.a, cellRange.b);
                  editorStore.updateElement(editingTable.id, {
                    cells: next.cells,
                    merges: next.merges ?? [],
                  });
                  setCellRange({ a: cellRange.a, b: cellRange.a });
                }}
              >
                合併儲存格
              </button>
              <button
                type="button"
                className="tool-btn px-2 py-1 text-[11px]"
                disabled={
                  !cellRange || !mergeCovering(editingTable, cellRange.a.row, cellRange.a.col)
                }
                onClick={() => {
                  if (!cellRange) return;
                  const next = unmergeCells(editingTable, cellRange.a.row, cellRange.a.col);
                  editorStore.updateElement(editingTable.id, { merges: next.merges ?? [] });
                }}
              >
                取消合併
              </button>
            </div>
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
              onInput={(e) => {
                const text = e.currentTarget.innerText.replace(/\r\n?/g, '\n');
                const grown = growTextHeight(editing, e.currentTarget.scrollHeight, height);
                editorStore.updateElement(
                  editing.id,
                  grown === editing.height ? { text } : { text, height: grown },
                  { transient: true },
                );
              }}
              onBlur={() => {
                editorStore.endTransaction();
                editorStore.setEditingText(null);
              }}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Escape') {
                  editorStore.endTransaction();
                  editorStore.setEditingText(null);
                  return;
                }
                // Tab 調整這一行的縮排，不要讓焦點跳走。
                if (e.key === 'Tab') {
                  e.preventDefault();
                  const root = e.currentTarget;
                  const text = root.innerText.replace(/\r\n?/g, '\n');
                  const caret = readCaret(root);
                  const next = changeIndent(
                    text,
                    caret?.start ?? text.length,
                    caret?.end ?? text.length,
                    e.shiftKey ? -1 : 1,
                  );
                  if (next.text === text) return;
                  root.innerText = next.text;
                  writeCaret(root, next.selectionStart, next.selectionEnd);
                  const grown = growTextHeight(editing, root.scrollHeight, height);
                  editorStore.updateElement(
                    editing.id,
                    grown === editing.height
                      ? { text: next.text }
                      : { text: next.text, height: grown },
                    { transient: true },
                  );
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

      {dropping && (
        <div
          className="pointer-events-none fixed inset-0 flex items-center justify-center"
          style={{ zIndex: LAYER.canvasMotion, background: 'rgba(79,70,229,.08)' }}
        >
          <div
            className="panel-card px-4 py-2 text-[13px] font-bold shadow-xl"
            style={{ border: '2px dashed var(--color-brand)' }}
          >
            放開就把圖片放進這張投影片
          </div>
        </div>
      )}

      {menu && (
        <div
          className="panel-card aps-fade-in fixed min-w-[196px] p-1.5 shadow-xl"
          role="menu"
          aria-label="快捷選單"
          style={{
            left: Math.min(menu.x, window.innerWidth - 216),
            top: Math.min(menu.y, window.innerHeight - 40 - menu.items.length * 30),
            zIndex: LAYER.menu,
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          {menu.items.map((item, index) =>
            item.separator ? (
              <div key={`${item.id}-${index}`} className="my-1.5 h-px bg-line" />
            ) : (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => runContextMenu(item.id)}
                className="flex w-full items-center gap-3 rounded-lg px-2.5 py-1.5 text-left text-[12px] transition hover:bg-panel-2 disabled:cursor-not-allowed disabled:opacity-40"
                style={item.danger ? { color: 'var(--color-danger)' } : undefined}
              >
                <span className="flex-1">{item.label}</span>
                {item.shortcut && (
                  <span className="font-mono text-[10.5px] text-ink-3">{item.shortcut}</span>
                )}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
