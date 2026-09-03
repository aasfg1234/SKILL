import {
  PRESENTATION_PROTOCOL,
  SPEC_VERSION,
  type AIComponentElement,
  type AIComponentKind,
  type AIOutputFormat,
  type AITask,
  type EllipseElement,
  type ImageElement,
  type LineElement,
  type Presentation,
  type RectElement,
  type ChartElement,
  type ChartSeries,
  type Slide,
  type SlideElement,
  type TableElement,
  type TextElement,
  type Theme,
} from './types';
import { newElementId, newId, newPresentationId, newSlideId, nextTaskId } from './ids';
import { evenColumnWidths } from './table';
import { DEFAULT_CHART_COLORS } from './chart';
import { DEFAULT_FONT_ID, fontStackOf } from '../lib/fonts';

export const DEFAULT_WIDTH = 1920;
export const DEFAULT_HEIGHT = 1080;

/**
 * 簡報的預設字型。
 *
 * 一律拉丁字型在前。中文字在各家字型都是等寬的，換字型不影響寬度；
 * 真正讓版面跑掉的是英文與數字，把它固定成 Arial 就不會跑版。
 * 詳見 src/lib/fonts.ts。
 */
export const FONT_STACK = fontStackOf(DEFAULT_FONT_ID);

export function createDefaultTheme(): Theme {
  return {
    id: 'theme-studio-light',
    name: '簡約淺色',
    mode: 'light',
    palette: {
      background: '#FFFFFF',
      surface: '#F5F7FA',
      primary: '#4F46E5',
      accent: '#0EA5E9',
      text: '#111827',
      muted: '#6B7280',
      border: '#E5E7EB',
    },
    fontFamily: FONT_STACK,
    headingFontFamily: FONT_STACK,
  };
}

export function createDarkTheme(): Theme {
  return {
    id: 'theme-studio-dark',
    name: '深色',
    mode: 'dark',
    palette: {
      background: '#0F1115',
      surface: '#181C23',
      primary: '#818CF8',
      accent: '#38BDF8',
      text: '#F3F4F6',
      muted: '#9CA3AF',
      border: '#2A313B',
    },
    fontFamily: FONT_STACK,
    headingFontFamily: FONT_STACK,
  };
}

function nextZ(elements: SlideElement[]): number {
  return elements.reduce((max, el) => Math.max(max, el.z), 0) + 1;
}

interface BaseInit {
  id?: string;
  groupId?: string;
  groupName?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  z?: number;
  name?: string;
  rotation?: number;
  opacity?: number;
  locked?: boolean;
  hidden?: boolean;
}

function base(kind: string, init: BaseInit, w: number, h: number) {
  return {
    id: init.id ?? newElementId(kind),
    name: init.name,
    ...(init.groupId ? { groupId: init.groupId } : {}),
    ...(init.groupName ? { groupName: init.groupName } : {}),
    x: init.x ?? 160,
    y: init.y ?? 160,
    width: init.width ?? w,
    height: init.height ?? h,
    rotation: init.rotation ?? 0,
    opacity: init.opacity ?? 1,
    locked: init.locked ?? false,
    hidden: init.hidden ?? false,
    // 0 代表「還沒決定層次」；真正的層次在加入投影片時由 addElementToSlide 指定。
    z: init.z ?? 0,
  };
}

export function createTextElement(
  init: BaseInit & Partial<TextElement> = {},
): TextElement {
  return {
    ...base('text', init, 800, 140),
    type: 'text',
    text: init.text ?? '雙擊以編輯文字',
    fontSize: init.fontSize ?? 48,
    bold: init.bold ?? false,
    italic: init.italic ?? false,
    underline: init.underline ?? false,
    align: init.align ?? 'left',
    verticalAlign: init.verticalAlign ?? 'middle',
    color: init.color ?? '#111827',
    lineHeight: init.lineHeight ?? 1.4,
    letterSpacing: init.letterSpacing ?? 0,
    listStyle: init.listStyle ?? 'none',
    ...(init.fontFamily ? { fontFamily: init.fontFamily } : {}),
  };
}

/**
 * 建立表格。
 *
 * 可以用 rows / columns 指定大小，也可以直接給 cells。
 * 欄寬用比例存，總和為 1，這樣縮放表格時欄位比例不會跑掉。
 */
export function createTableElement(
  init: BaseInit & Partial<TableElement> & { rows?: number; columns?: number } = {},
): TableElement {
  const rowCount = Math.max(1, init.cells?.length ?? init.rows ?? 3);
  const columnCount = Math.max(1, init.cells?.[0]?.length ?? init.columns ?? 3);
  const cells =
    init.cells?.map((line) => [...line]) ??
    Array.from({ length: rowCount }, () => Array.from({ length: columnCount }, () => ''));

  return {
    ...base('table', init, 1200, 480),
    type: 'table',
    cells,
    columnWidths: init.columnWidths ?? evenColumnWidths(columnCount),
    headerRow: init.headerRow ?? true,
    fontSize: init.fontSize ?? 32,
    color: init.color ?? '#111827',
    borderColor: init.borderColor ?? '#D1D5DB',
    headerFill: init.headerFill ?? '#F3F4F6',
    cellPadding: init.cellPadding ?? 16,
    ...(init.fontFamily ? { fontFamily: init.fontFamily } : {}),
  };
}

/** 沒指定 series 時的預設值；若呼叫端給了舊版的 values 就沿用。 */
function defaultSeries(init: { values?: number[] }): ChartSeries[] {
  return [{ name: '', values: init.values ?? [32, 48, 41, 60] }];
}

/**
 * 建立圖表。
 *
 * 這一版只支援單一數列：一組標籤配一組數值。
 * 數值不足會補零，多的忽略，詳見 src/model/chart.ts。
 */
export function createChartElement(
  init: BaseInit & Partial<ChartElement> = {},
): ChartElement {
  return {
    ...base('chart', init, 900, 520),
    type: 'chart',
    chartType: init.chartType ?? 'bar',
    labels: init.labels ?? ['第一季', '第二季', '第三季', '第四季'],
    series: init.series ?? defaultSeries(init),
    colors: init.colors ?? [...DEFAULT_CHART_COLORS],
    title: init.title ?? '',
    showValues: init.showValues ?? true,
    showLegend: init.showLegend ?? true,
    fontSize: init.fontSize ?? 28,
    color: init.color ?? '#111827',
    gridColor: init.gridColor ?? '#E5E7EB',
    ...(init.fontFamily ? { fontFamily: init.fontFamily } : {}),
  };
}

export function createRectElement(init: BaseInit & Partial<RectElement> = {}): RectElement {
  return {
    ...base('rect', init, 480, 300),
    type: 'rect',
    fill: init.fill ?? '#E0E7FF',
    stroke: init.stroke ?? '#4F46E5',
    strokeWidth: init.strokeWidth ?? 0,
    radius: init.radius ?? 16,
    ...(init.opacity !== undefined ? { opacity: init.opacity } : {}),
  };
}

export function createEllipseElement(
  init: BaseInit & Partial<EllipseElement> = {},
): EllipseElement {
  return {
    ...base('ellipse', init, 320, 320),
    type: 'ellipse',
    fill: init.fill ?? '#CFFAFE',
    stroke: init.stroke ?? '#0EA5E9',
    strokeWidth: init.strokeWidth ?? 0,
  };
}

export function createLineElement(init: BaseInit & Partial<LineElement> = {}): LineElement {
  return {
    ...base('line', init, 600, 8),
    type: 'line',
    stroke: init.stroke ?? '#111827',
    strokeWidth: init.strokeWidth ?? 4,
  };
}

export function createImageElement(init: BaseInit & Partial<ImageElement> = {}): ImageElement {
  return {
    ...base('image', init, 640, 400),
    type: 'image',
    src: init.src ?? '',
    alt: init.alt ?? '圖片',
    fit: init.fit ?? 'contain',
    radius: init.radius ?? 8,
  };
}

export function createAiComponentElement(
  init: BaseInit & Partial<AIComponentElement> & { taskId: string },
): AIComponentElement {
  return {
    ...base('ai', init, 900, 500),
    type: 'ai_component',
    kind: (init.kind ?? 'chart') as AIComponentKind,
    prompt: init.prompt ?? '',
    outputFormat: (init.outputFormat ?? 'svg') as AIOutputFormat,
    status: init.status ?? 'pending',
    taskId: init.taskId,
    ...(init.result ? { result: init.result } : {}),
  };
}

export function createSlide(init: Partial<Slide> = {}): Slide {
  return {
    id: init.id ?? newSlideId(),
    title: init.title ?? '未命名投影片',
    background: init.background ?? '#FFFFFF',
    useMasterBackground: init.useMasterBackground ?? true,
    ...(init.masterKind ? { masterKind: init.masterKind } : {}),
    notes: init.notes ?? '',
    elements: init.elements ?? [],
  };
}

export function createPresentation(init: Partial<Presentation> = {}): Presentation {
  const now = new Date().toISOString();
  return {
    protocol: PRESENTATION_PROTOCOL,
    version: SPEC_VERSION,
    metadata: {
      id: init.metadata?.id ?? newPresentationId(),
      title: init.metadata?.title ?? '未命名簡報',
      author: init.metadata?.author ?? '',
      description: init.metadata?.description ?? '',
      createdAt: init.metadata?.createdAt ?? now,
      updatedAt: init.metadata?.updatedAt ?? now,
    },
    settings: init.settings ?? {
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT,
      aspectRatio: '16:9',
    },
    theme: init.theme ?? createDefaultTheme(),
    masters:
      init.masters ?? {
        cover: createSlide({
          id: 'master-cover',
          title: '封面母片',
          background: '#FFFFFF',
          useMasterBackground: false,
        }),
        content: createSlide({
          id: 'master-content',
          title: '內容母片',
          background: '#FFFFFF',
          useMasterBackground: false,
        }),
      },
    slides: init.slides ?? [createSlide({ title: '投影片 1' })],
    aiTasks: init.aiTasks ?? [],
    execution: init.execution ?? { mode: 'external-handoff' },
  };
}

/** 產生一個尚未被使用的 Task ID。 */
export function allocateTaskId(presentation: Presentation): string {
  const used = new Set<string>(presentation.aiTasks.map((t) => t.id));
  for (const slide of presentation.slides) {
    for (const el of slide.elements) {
      if (el.type === 'ai_component') used.add(el.taskId);
    }
  }
  return nextTaskId(used);
}

export function addElementToSlide(slide: Slide, element: SlideElement): Slide {
  const el = { ...element, z: element.z || nextZ(slide.elements) };
  return { ...slide, elements: [...slide.elements, el] };
}

export function topZ(slide: Slide): number {
  return nextZ(slide.elements);
}

/**
 * 由 AI 元件重新推導 aiTasks 清單。
 * 元件是位置與內容的來源，aiTasks 是給外部 AI 的宣告式任務視圖，
 * 兩者永遠保持一致，避免資料漂移。
 */
export function syncAiTasks(presentation: Presentation): Presentation {
  const previous = new Map(presentation.aiTasks.map((t) => [t.id, t]));
  const tasks: AITask[] = [];

  presentation.slides.forEach((slide, slideIndex) => {
    for (const el of slide.elements) {
      if (el.type !== 'ai_component') continue;
      const prev = previous.get(el.taskId);
      const task: AITask = {
        id: el.taskId,
        type: el.kind,
        target: { slideId: slide.id, elementId: el.id },
        prompt: el.prompt,
        outputFormat: el.outputFormat,
        status: el.status,
        constraints: prev?.constraints ?? {
          preservePosition: true,
          preserveSize: true,
          preserveAspectRatio: false,
        },
        layoutHint: {
          slideIndex: slideIndex + 1,
          x: el.x,
          y: el.y,
          width: el.width,
          height: el.height,
          slideWidth: presentation.settings.width,
          slideHeight: presentation.settings.height,
        },
      };
      if (el.result) task.result = el.result;
      if (el.errorMessage) task.errorMessage = el.errorMessage;
      tasks.push(task);
    }
  });

  return { ...presentation, aiTasks: tasks };
}

/** 深層複製一個元素並配發新的穩定 ID（AI 元件也會取得新的 Task ID）。 */
export function cloneElement(
  element: SlideElement,
  presentation: Presentation,
  offset = 40,
): SlideElement {
  const copy = structuredClone(element);
  copy.id = newElementId(element.type === 'ai_component' ? 'ai' : element.type);
  copy.x += offset;
  copy.y += offset;
  if (copy.type === 'ai_component') {
    copy.taskId = allocateTaskId(presentation);
  }
  return copy;
}

export function cloneSlide(slide: Slide, presentation: Presentation): Slide {
  const copy = structuredClone(slide);
  copy.id = newSlideId();
  copy.title = `${slide.title}（複本）`;
  const usedTasks = new Set<string>(presentation.aiTasks.map((t) => t.id));
  copy.elements = copy.elements.map((el) => {
    const next = structuredClone(el);
    next.id = newElementId(el.type === 'ai_component' ? 'ai' : el.type);
    if (next.type === 'ai_component') {
      const id = nextTaskId(usedTasks);
      usedTasks.add(id);
      next.taskId = id;
    }
    return next;
  });
  return copy;
}

export function newThemeId(): string {
  return newId('theme');
}
