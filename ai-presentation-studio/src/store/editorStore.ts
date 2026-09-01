import { useSyncExternalStore } from 'react';
import {
  addElementToSlide,
  cloneElement,
  cloneSlide,
  createSlide,
  syncAiTasks,
  topZ,
} from '../model/factory';
import { createDemoPresentation } from '../model/demo';
import { applyPatch, mergeCompletedPresentation, type MergeSummary } from '../model/patch';
import type {
  Presentation,
  PresentationPatch,
  Slide,
  SlideElement,
  ValidationReport,
} from '../model/types';

/**
 * 編輯器狀態管理。
 *
 * 刻意不引入 Redux 或其他大型狀態框架：
 * 一個模組層級的 store + useSyncExternalStore 就足以支撐這個 MVP，
 * 而且讓「Presentation Specification 是唯一 Source of Truth」這件事一目了然。
 */

export type ToolId =
  | 'select'
  | 'text'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'image'
  | 'ai_component';

export interface ToastMessage {
  id: string;
  tone: 'info' | 'success' | 'warning' | 'error';
  title: string;
  detail?: string;
}

export type DialogState =
  | { kind: 'validation'; report: ValidationReport }
  | { kind: 'merge'; title: string; summary: MergeSummary }
  | { kind: 'ai-prompt'; text: string }
  | { kind: 'settings' }
  | { kind: 'help' }
  | null;

export interface EditorState {
  presentation: Presentation;
  currentSlideId: string;
  selectedIds: string[];
  tool: ToolId;
  zoom: number;
  fitToWindow: boolean;
  snapEnabled: boolean;
  showGuides: boolean;
  uiTheme: 'light' | 'dark';
  editingTextId: string | null;
  previewMode: boolean;
  previewIndex: number;
  toasts: ToastMessage[];
  canUndo: boolean;
  canRedo: boolean;
  savedAt: string | null;
  dirty: boolean;
  dialog: DialogState;
}

export const STORAGE_KEY = 'ai-presentation-studio/v1';
const HISTORY_LIMIT = 120;

interface Persisted {
  presentation: Presentation;
  currentSlideId?: string;
  savedAt?: string;
}

function loadPersisted(): Persisted | null {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Persisted;
    if (!parsed?.presentation?.slides?.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

function initialState(): EditorState {
  const persisted = loadPersisted();
  const presentation = persisted?.presentation ?? createDemoPresentation();
  const currentSlideId =
    persisted?.currentSlideId && presentation.slides.some((s) => s.id === persisted.currentSlideId)
      ? persisted.currentSlideId
      : presentation.slides[0].id;
  return {
    presentation,
    currentSlideId,
    selectedIds: [],
    tool: 'select',
    zoom: 0.4,
    fitToWindow: true,
    snapEnabled: true,
    showGuides: true,
    uiTheme: 'light',
    editingTextId: null,
    previewMode: false,
    previewIndex: 0,
    toasts: [],
    canUndo: false,
    canRedo: false,
    savedAt: persisted?.savedAt ?? null,
    dirty: false,
    dialog: null,
  };
}

class EditorStore {
  private state: EditorState = initialState();
  private listeners = new Set<() => void>();
  private past: Presentation[] = [];
  private future: Presentation[] = [];
  private txBase: Presentation | null = null;
  private clipboard: SlideElement[] = [];
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getState = (): EditorState => this.state;

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  private set(patch: Partial<EditorState>): void {
    this.state = { ...this.state, ...patch };
    this.emit();
  }

  private syncHistoryFlags(extra: Partial<EditorState> = {}): void {
    this.set({
      canUndo: this.past.length > 0,
      canRedo: this.future.length > 0,
      ...extra,
    });
  }

  private touch(presentation: Presentation): Presentation {
    const synced = syncAiTasks(presentation);
    return {
      ...synced,
      metadata: { ...synced.metadata, updatedAt: new Date().toISOString() },
    };
  }

  private pushHistory(): void {
    this.past.push(structuredClone(this.state.presentation));
    if (this.past.length > HISTORY_LIMIT) this.past.shift();
    this.future = [];
  }

  /** 一般編輯：立即建立一個復原點。 */
  commit(recipe: (draft: Presentation) => Presentation | void): void {
    if (this.txBase === null) this.pushHistory();
    const draft = structuredClone(this.state.presentation);
    const result = recipe(draft) ?? draft;
    this.set({ presentation: this.touch(result), dirty: true });
    this.syncHistoryFlags();
    this.scheduleSave();
  }

  /** 連續操作（拖曳／縮放）開始：只建立一個復原點。 */
  beginTransaction(): void {
    if (this.txBase !== null) return;
    this.txBase = structuredClone(this.state.presentation);
    this.pushHistory();
  }

  /** 連續操作進行中：不再產生新的復原點。 */
  transient(recipe: (draft: Presentation) => Presentation | void): void {
    const draft = structuredClone(this.state.presentation);
    const result = recipe(draft) ?? draft;
    this.set({ presentation: syncAiTasks(result), dirty: true });
  }

  endTransaction(): void {
    if (this.txBase === null) return;
    const unchanged =
      JSON.stringify(this.txBase) === JSON.stringify(this.state.presentation);
    if (unchanged) {
      this.past.pop();
    } else {
      this.set({
        presentation: {
          ...this.state.presentation,
          metadata: {
            ...this.state.presentation.metadata,
            updatedAt: new Date().toISOString(),
          },
        },
      });
    }
    this.txBase = null;
    this.syncHistoryFlags();
    this.scheduleSave();
  }

  undo(): void {
    const previous = this.past.pop();
    if (!previous) return;
    this.future.push(structuredClone(this.state.presentation));
    this.set({ presentation: previous, dirty: true });
    this.ensureValidSelection();
    this.syncHistoryFlags();
    this.scheduleSave();
  }

  redo(): void {
    const next = this.future.pop();
    if (!next) return;
    this.past.push(structuredClone(this.state.presentation));
    this.set({ presentation: next, dirty: true });
    this.ensureValidSelection();
    this.syncHistoryFlags();
    this.scheduleSave();
  }

  private ensureValidSelection(): void {
    const { presentation, currentSlideId, selectedIds } = this.state;
    const slide =
      presentation.slides.find((s) => s.id === currentSlideId) ?? presentation.slides[0];
    const ids = new Set(slide?.elements.map((el) => el.id) ?? []);
    this.set({
      currentSlideId: slide?.id ?? '',
      selectedIds: selectedIds.filter((id) => ids.has(id)),
      editingTextId: null,
    });
  }

  /* ---------------------------------------------------------------- */
  /* 儲存                                                              */
  /* ---------------------------------------------------------------- */

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.save(), 600);
  }

  save(): boolean {
    try {
      const payload: Persisted = {
        presentation: this.state.presentation,
        currentSlideId: this.state.currentSlideId,
        savedAt: new Date().toISOString(),
      };
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(payload));
      this.set({ savedAt: payload.savedAt ?? null, dirty: false });
      return true;
    } catch (err) {
      this.toast({
        tone: 'error',
        title: '自動儲存失敗',
        detail: (err as Error).message,
      });
      return false;
    }
  }

  /* ---------------------------------------------------------------- */
  /* 檢視狀態                                                          */
  /* ---------------------------------------------------------------- */

  setTool(tool: ToolId): void {
    this.set({ tool });
  }

  setZoom(zoom: number): void {
    this.set({ zoom: Math.min(3, Math.max(0.05, zoom)), fitToWindow: false });
  }

  setFitToWindow(fit: boolean): void {
    this.set({ fitToWindow: fit });
  }

  /** 由畫布計算出的自動縮放：維持「符合視窗」模式。 */
  setFitZoom(zoom: number): void {
    if (Math.abs(this.state.zoom - zoom) < 0.0005) return;
    this.set({ zoom: Math.min(3, Math.max(0.05, zoom)) });
  }

  toggleSnap(): void {
    this.set({ snapEnabled: !this.state.snapEnabled });
  }

  toggleGuides(): void {
    this.set({ showGuides: !this.state.showGuides });
  }

  setUiTheme(uiTheme: 'light' | 'dark'): void {
    this.set({ uiTheme });
  }

  setEditingText(id: string | null): void {
    this.set({ editingTextId: id });
  }

  enterPreview(index?: number): void {
    const idx =
      index ??
      Math.max(
        0,
        this.state.presentation.slides.findIndex((s) => s.id === this.state.currentSlideId),
      );
    this.set({ previewMode: true, previewIndex: idx });
  }

  exitPreview(): void {
    const slide = this.state.presentation.slides[this.state.previewIndex];
    this.set({
      previewMode: false,
      ...(slide ? { currentSlideId: slide.id } : {}),
    });
  }

  setPreviewIndex(index: number): void {
    const max = this.state.presentation.slides.length - 1;
    this.set({ previewIndex: Math.min(max, Math.max(0, index)) });
  }

  openDialog(dialog: DialogState): void {
    this.set({ dialog });
  }

  closeDialog(): void {
    this.set({ dialog: null });
  }

  toast(message: Omit<ToastMessage, 'id'>): void {
    const item: ToastMessage = { ...message, id: `toast-${Date.now()}-${Math.random()}` };
    this.set({ toasts: [...this.state.toasts, item] });
    setTimeout(() => this.dismissToast(item.id), message.tone === 'error' ? 9000 : 5000);
  }

  dismissToast(id: string): void {
    this.set({ toasts: this.state.toasts.filter((t) => t.id !== id) });
  }

  /* ---------------------------------------------------------------- */
  /* 投影片                                                            */
  /* ---------------------------------------------------------------- */

  get currentSlide(): Slide | undefined {
    return this.state.presentation.slides.find((s) => s.id === this.state.currentSlideId);
  }

  selectSlide(slideId: string): void {
    if (!this.state.presentation.slides.some((s) => s.id === slideId)) return;
    this.set({ currentSlideId: slideId, selectedIds: [], editingTextId: null });
  }

  addSlide(afterSlideId?: string): void {
    const slide = createSlide({ title: `投影片 ${this.state.presentation.slides.length + 1}` });
    this.commit((draft) => {
      const index = afterSlideId
        ? draft.slides.findIndex((s) => s.id === afterSlideId) + 1
        : draft.slides.length;
      draft.slides.splice(index, 0, slide);
    });
    this.set({ currentSlideId: slide.id, selectedIds: [] });
  }

  deleteSlide(slideId: string): void {
    if (this.state.presentation.slides.length <= 1) {
      this.toast({ tone: 'warning', title: '至少要保留一張投影片' });
      return;
    }
    const index = this.state.presentation.slides.findIndex((s) => s.id === slideId);
    this.commit((draft) => {
      draft.slides = draft.slides.filter((s) => s.id !== slideId);
    });
    const slides = this.state.presentation.slides;
    const next = slides[Math.min(index, slides.length - 1)];
    this.set({ currentSlideId: next.id, selectedIds: [] });
  }

  duplicateSlide(slideId: string): void {
    const source = this.state.presentation.slides.find((s) => s.id === slideId);
    if (!source) return;
    const copy = cloneSlide(source, this.state.presentation);
    this.commit((draft) => {
      const index = draft.slides.findIndex((s) => s.id === slideId) + 1;
      draft.slides.splice(index, 0, copy);
    });
    this.set({ currentSlideId: copy.id, selectedIds: [] });
  }

  moveSlide(slideId: string, direction: -1 | 1): void {
    this.commit((draft) => {
      const index = draft.slides.findIndex((s) => s.id === slideId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= draft.slides.length) return;
      const [slide] = draft.slides.splice(index, 1);
      draft.slides.splice(target, 0, slide);
    });
  }

  updateSlide(slideId: string, props: Partial<Slide>): void {
    this.commit((draft) => {
      const slide = draft.slides.find((s) => s.id === slideId);
      if (!slide) return;
      Object.assign(slide, props);
    });
  }

  /* ---------------------------------------------------------------- */
  /* 元素                                                              */
  /* ---------------------------------------------------------------- */

  select(ids: string[], additive = false): void {
    const next = additive
      ? [...new Set([...this.state.selectedIds, ...ids])]
      : ids;
    this.set({ selectedIds: next, editingTextId: null });
  }

  clearSelection(): void {
    this.set({ selectedIds: [], editingTextId: null });
  }

  addElement(element: SlideElement, slideId = this.state.currentSlideId): void {
    this.commit((draft) => {
      const index = draft.slides.findIndex((s) => s.id === slideId);
      if (index < 0) return;
      draft.slides[index] = addElementToSlide(draft.slides[index], {
        ...element,
        z: element.z || topZ(draft.slides[index]),
      });
    });
    this.set({ selectedIds: [element.id], tool: 'select' });
  }

  updateElement(
    elementId: string,
    props: Record<string, unknown>,
    options: { transient?: boolean } = {},
  ): void {
    const recipe = (draft: Presentation) => {
      for (const slide of draft.slides) {
        const el = slide.elements.find((e) => e.id === elementId);
        if (!el) continue;
        Object.assign(el, props);
        return;
      }
    };
    if (options.transient) this.transient(recipe);
    else this.commit(recipe);
  }

  updateSelected(props: Record<string, unknown>, options: { transient?: boolean } = {}): void {
    const ids = new Set(this.state.selectedIds);
    const recipe = (draft: Presentation) => {
      for (const slide of draft.slides) {
        for (const el of slide.elements) {
          if (ids.has(el.id) && !el.locked) Object.assign(el, props);
        }
      }
    };
    if (options.transient) this.transient(recipe);
    else this.commit(recipe);
  }

  deleteSelected(): void {
    const ids = new Set(this.state.selectedIds);
    if (ids.size === 0) return;
    const locked = this.selectedElements().filter((el) => el.locked);
    if (locked.length > 0) {
      this.toast({ tone: 'warning', title: '有元素已鎖定，無法刪除' });
    }
    this.commit((draft) => {
      for (const slide of draft.slides) {
        slide.elements = slide.elements.filter((el) => !ids.has(el.id) || el.locked);
      }
    });
    this.set({ selectedIds: locked.map((el) => el.id) });
  }

  duplicateSelected(): void {
    const source = this.selectedElements();
    if (source.length === 0) return;
    const copies = source.map((el) => cloneElement(el, this.state.presentation));
    this.commit((draft) => {
      const slide = draft.slides.find((s) => s.id === this.state.currentSlideId);
      if (!slide) return;
      let z = topZ(slide);
      for (const copy of copies) {
        slide.elements.push({ ...copy, z: z++ });
      }
    });
    this.set({ selectedIds: copies.map((c) => c.id) });
  }

  copySelection(): void {
    const source = this.selectedElements();
    if (source.length === 0) return;
    this.clipboard = structuredClone(source);
    this.toast({ tone: 'info', title: `已複製 ${source.length} 個元素` });
  }

  paste(): void {
    if (this.clipboard.length === 0) return;
    const copies = this.clipboard.map((el) => cloneElement(el, this.state.presentation));
    this.commit((draft) => {
      const slide = draft.slides.find((s) => s.id === this.state.currentSlideId);
      if (!slide) return;
      let z = topZ(slide);
      for (const copy of copies) slide.elements.push({ ...copy, z: z++ });
    });
    this.set({ selectedIds: copies.map((c) => c.id) });
  }

  nudge(dx: number, dy: number): void {
    const ids = new Set(this.state.selectedIds);
    if (ids.size === 0) return;
    this.commit((draft) => {
      for (const slide of draft.slides) {
        for (const el of slide.elements) {
          if (!ids.has(el.id) || el.locked) continue;
          el.x = Math.round(el.x + dx);
          el.y = Math.round(el.y + dy);
        }
      }
    });
  }

  reorder(mode: 'front' | 'back' | 'forward' | 'backward'): void {
    const ids = new Set(this.state.selectedIds);
    if (ids.size === 0) return;
    this.commit((draft) => {
      const slide = draft.slides.find((s) => s.id === this.state.currentSlideId);
      if (!slide) return;
      const sorted = [...slide.elements].sort((a, b) => a.z - b.z);
      const targets = sorted.filter((el) => ids.has(el.id));
      if (targets.length === 0) return;

      if (mode === 'front' || mode === 'back') {
        const rest = sorted.filter((el) => !ids.has(el.id));
        const ordered = mode === 'front' ? [...rest, ...targets] : [...targets, ...rest];
        ordered.forEach((el, i) => {
          el.z = i + 1;
        });
      } else {
        const delta = mode === 'forward' ? 1 : -1;
        const list = [...sorted];
        const indices = list
          .map((el, i) => (ids.has(el.id) ? i : -1))
          .filter((i) => i >= 0);
        const ordered = delta > 0 ? indices.reverse() : indices;
        for (const i of ordered) {
          const j = i + delta;
          if (j < 0 || j >= list.length) continue;
          [list[i], list[j]] = [list[j], list[i]];
        }
        list.forEach((el, i) => {
          el.z = i + 1;
        });
      }
      slide.elements = sorted;
    });
  }

  align(mode: 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom'): void {
    const ids = new Set(this.state.selectedIds);
    const { width, height } = this.state.presentation.settings;
    const selected = this.selectedElements();
    if (selected.length === 0) return;

    const multi = selected.length > 1;
    const minX = Math.min(...selected.map((el) => el.x));
    const maxX = Math.max(...selected.map((el) => el.x + el.width));
    const minY = Math.min(...selected.map((el) => el.y));
    const maxY = Math.max(...selected.map((el) => el.y + el.height));

    this.commit((draft) => {
      for (const slide of draft.slides) {
        for (const el of slide.elements) {
          if (!ids.has(el.id) || el.locked) continue;
          switch (mode) {
            case 'left':
              el.x = multi ? minX : 0;
              break;
            case 'right':
              el.x = (multi ? maxX : width) - el.width;
              break;
            case 'center-x':
              el.x = Math.round((multi ? (minX + maxX) / 2 : width / 2) - el.width / 2);
              break;
            case 'top':
              el.y = multi ? minY : 0;
              break;
            case 'bottom':
              el.y = (multi ? maxY : height) - el.height;
              break;
            case 'center-y':
              el.y = Math.round((multi ? (minY + maxY) / 2 : height / 2) - el.height / 2);
              break;
          }
        }
      }
    });
  }

  selectedElements(): SlideElement[] {
    const ids = new Set(this.state.selectedIds);
    const slide = this.currentSlide;
    if (!slide) return [];
    return slide.elements.filter((el) => ids.has(el.id));
  }

  /* ---------------------------------------------------------------- */
  /* 簡報層級                                                          */
  /* ---------------------------------------------------------------- */

  replacePresentation(presentation: Presentation, options: { resetHistory?: boolean } = {}): void {
    if (options.resetHistory) {
      this.past = [];
      this.future = [];
    } else {
      this.pushHistory();
    }
    const synced = syncAiTasks(presentation);
    this.set({
      presentation: synced,
      currentSlideId: synced.slides[0]?.id ?? '',
      selectedIds: [],
      editingTextId: null,
      dirty: true,
    });
    this.syncHistoryFlags();
    this.save();
  }

  updateMetadata(props: Partial<Presentation['metadata']>): void {
    this.commit((draft) => {
      Object.assign(draft.metadata, props);
    });
  }

  updateSettings(props: Partial<Presentation['settings']>): void {
    this.commit((draft) => {
      Object.assign(draft.settings, props);
    });
  }

  applyPresentationPatch(patch: PresentationPatch): MergeSummary {
    const result = applyPatch(this.state.presentation, patch);
    this.pushHistory();
    this.set({ presentation: this.touch(result.presentation), dirty: true });
    this.syncHistoryFlags();
    this.scheduleSave();
    return result.summary;
  }

  importCompleted(completed: Presentation): MergeSummary {
    const result = mergeCompletedPresentation(this.state.presentation, completed);
    this.pushHistory();
    this.set({ presentation: this.touch(result.presentation), dirty: true });
    this.syncHistoryFlags();
    this.scheduleSave();
    return result.summary;
  }

  resetToDemo(): void {
    this.replacePresentation(createDemoPresentation(), { resetHistory: true });
    this.toast({ tone: 'success', title: '已重新載入示範簡報' });
  }
}

export const editorStore = new EditorStore();

export function useEditorState(): EditorState {
  return useSyncExternalStore(editorStore.subscribe, editorStore.getState, editorStore.getState);
}

export function useCurrentSlide(): Slide | undefined {
  const state = useEditorState();
  return state.presentation.slides.find((s) => s.id === state.currentSlideId);
}

export function useSelectedElements(): SlideElement[] {
  const state = useEditorState();
  const slide = state.presentation.slides.find((s) => s.id === state.currentSlideId);
  if (!slide) return [];
  const ids = new Set(state.selectedIds);
  return slide.elements.filter((el) => ids.has(el.id));
}
