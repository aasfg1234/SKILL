/**
 * AI Presentation Studio — Presentation Specification
 *
 * 這份型別定義是整個產品的唯一 Source of Truth。
 * 編輯器、驗證器、HTML Renderer、AI Handoff 都以此為基礎。
 */

export const PRESENTATION_PROTOCOL = 'ai-presentation/v1' as const;
export const PATCH_PROTOCOL = 'ai-presentation-patch/v1' as const;
export const SPEC_VERSION = '1.0.0' as const;

/* ------------------------------------------------------------------ */
/* Theme                                                               */
/* ------------------------------------------------------------------ */

export interface Theme {
  id: string;
  name: string;
  mode: 'light' | 'dark';
  palette: {
    background: string;
    surface: string;
    primary: string;
    accent: string;
    text: string;
    muted: string;
    border: string;
  };
  fontFamily: string;
  headingFontFamily: string;
}

/* ------------------------------------------------------------------ */
/* Elements                                                            */
/* ------------------------------------------------------------------ */

export type ElementType =
  | 'text'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'image'
  | 'table'
  | 'chart'
  | 'ai_component';

export interface BaseElement {
  id: string;
  type: ElementType;
  /** 使用者可讀名稱（圖層列表用） */
  name?: string;
  /** 同一張投影片中，共用此 ID 的元素視為同一個群組。 */
  groupId?: string;
  /** 群組顯示名稱；同一群組的成員應使用相同名稱。 */
  groupName?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  locked: boolean;
  hidden: boolean;
  /** 疊放順序，數字越大越上層 */
  z: number;
}

export type TextAlign = 'left' | 'center' | 'right';
export type VerticalAlign = 'top' | 'middle' | 'bottom';

/** 條列樣式：無、項目符號、編號 */
export type ListStyle = 'none' | 'bullet' | 'number';

export interface TextElement extends BaseElement {
  type: 'text';
  text: string;
  fontSize: number;
  fontFamily?: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: TextAlign;
  verticalAlign: VerticalAlign;
  color: string;
  lineHeight: number;
  letterSpacing: number;
  /** 每一行前面要不要加符號或編號 */
  listStyle: ListStyle;
}

/** 一塊被合併的儲存格範圍，左上角是 (row, col)。 */
export interface TableMerge {
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
}

export interface TableElement extends BaseElement {
  type: 'table';
  /** cells[列][欄] */
  cells: string[][];
  /** 已合併的範圍；被蓋住的格子不會單獨顯示 */
  merges?: TableMerge[];
  /** 每一欄佔總寬的比例，總和為 1 */
  columnWidths: number[];
  /** 第一列是否當成標題列 */
  headerRow: boolean;
  fontSize: number;
  fontFamily?: string;
  color: string;
  borderColor: string;
  headerFill: string;
  cellPadding: number;
}

export interface RectElement extends BaseElement {
  type: 'rect';
  fill: string;
  stroke: string;
  strokeWidth: number;
  radius: number;
}

export interface EllipseElement extends BaseElement {
  type: 'ellipse';
  fill: string;
  stroke: string;
  strokeWidth: number;
}

export interface LineElement extends BaseElement {
  type: 'line';
  stroke: string;
  strokeWidth: number;
}

export type ImageFit = 'contain' | 'cover' | 'fill';

export interface ImageElement extends BaseElement {
  type: 'image';
  /** data: URL 或相對路徑；本機優先使用 data URL 以保持 self-contained */
  src: string;
  alt: string;
  fit: ImageFit;
  radius: number;
}

export type AIComponentKind =
  | 'text'
  | 'image'
  | 'chart'
  | 'diagram'
  | 'timeline'
  | 'table'
  | 'infographic'
  | 'custom';

export type AIOutputFormat = 'svg' | 'html' | 'text' | 'json' | 'image';

export type AIStatus = 'pending' | 'processing' | 'completed' | 'error';

export interface AIOutput {
  type: AIOutputFormat;
  /** svg / html / text 為字串；json 可為任意結構；image 為 data URL */
  content: string;
  /** 產生此結果的來源，例如 "external-ai" / "mock" */
  producer?: string;
  producedAt?: string;
}

export interface AIComponentElement extends BaseElement {
  type: 'ai_component';
  kind: AIComponentKind;
  prompt: string;
  outputFormat: AIOutputFormat;
  status: AIStatus;
  /** 對應 aiTasks 中的 AITask.id，穩定不變 */
  taskId: string;
  result?: AIOutput;
  /** status = 'error' 時的訊息 */
  errorMessage?: string;
}

export type ChartType = 'bar' | 'hbar' | 'line' | 'pie';

/** 一組數列：一個名稱配一串數值，長度對應 labels。 */
export interface ChartSeries {
  name: string;
  values: number[];
}

export interface ChartElement extends BaseElement {
  type: 'chart';
  chartType: ChartType;
  /** 每一類的名稱 */
  labels: string[];
  /** 數列；可以有多組。讀取時請一律用 seriesOf() 以相容舊資料 */
  series: ChartSeries[];
  /** 舊版的單一數列；載入時會轉成 series，新程式不要再寫入 */
  values?: number[];
  /** 要不要顯示圖例 */
  showLegend: boolean;
  /** 依序使用的顏色，用完會循環 */
  colors: string[];
  title: string;
  /** 要不要在圖上標出數值 */
  showValues: boolean;
  fontSize: number;
  fontFamily?: string;
  /** 文字顏色 */
  color: string;
  /** 格線顏色 */
  gridColor: string;
}

export type SlideElement =
  | TextElement
  | TableElement
  | ChartElement
  | RectElement
  | EllipseElement
  | LineElement
  | ImageElement
  | AIComponentElement;

/* ------------------------------------------------------------------ */
/* Slide / Presentation                                                */
/* ------------------------------------------------------------------ */

export interface Slide {
  id: string;
  title: string;
  background: string;
  notes: string;
  elements: SlideElement[];
}

export interface AITaskConstraints {
  preservePosition: boolean;
  preserveSize: boolean;
  preserveAspectRatio: boolean;
}

export interface AITask {
  id: string;
  type: AIComponentKind;
  target: {
    slideId: string;
    elementId: string;
  };
  prompt: string;
  outputFormat: AIOutputFormat;
  status: AIStatus;
  result?: AIOutput;
  errorMessage?: string;
  constraints?: AITaskConstraints;
  /** 給外部 AI 的位置提示，避免它猜測版面 */
  layoutHint?: {
    slideIndex: number;
    x: number;
    y: number;
    width: number;
    height: number;
    slideWidth: number;
    slideHeight: number;
  };
}

export interface PresentationSettings {
  width: number;
  height: number;
  aspectRatio: string;
  /** 播放與匯出時，隱藏還沒交回結果的 AI 元件，避免觀眾看到佔位框 */
  hideIncompleteAi?: boolean;
}

export interface Presentation {
  protocol: typeof PRESENTATION_PROTOCOL;
  version: string;
  metadata: {
    id: string;
    title: string;
    author: string;
    description: string;
    createdAt: string;
    updatedAt: string;
  };
  settings: PresentationSettings;
  theme: Theme;
  slides: Slide[];
  aiTasks: AITask[];
  /** 預留未來執行模式，第一版僅 external-handoff */
  execution?: {
    mode: 'external-handoff';
    provider?: string;
  };
}

/* ------------------------------------------------------------------ */
/* Patch protocol                                                      */
/* ------------------------------------------------------------------ */

export interface AddElementOperation {
  operation: 'add_element';
  slideId: string;
  element: SlideElement;
}

export interface UpdateElementOperation {
  operation: 'update_element';
  slideId?: string;
  elementId: string;
  props: Partial<SlideElement> & Record<string, unknown>;
}

export interface DeleteElementOperation {
  operation: 'delete_element';
  slideId?: string;
  elementId: string;
}

export interface ReplaceAiOutputOperation {
  operation: 'replace_ai_output';
  taskId: string;
  targetElementId: string;
  output: AIOutput;
  status?: AIStatus;
  errorMessage?: string;
}

export type PatchOperation =
  | AddElementOperation
  | UpdateElementOperation
  | DeleteElementOperation
  | ReplaceAiOutputOperation;

export interface PresentationPatch {
  protocol: typeof PATCH_PROTOCOL;
  presentationId?: string;
  generatedAt?: string;
  operations: PatchOperation[];
}

/* ------------------------------------------------------------------ */
/* Validation report                                                   */
/* ------------------------------------------------------------------ */

export type ValidationSeverity = 'error' | 'warning';

export interface ValidationIssue {
  code: string;
  severity: ValidationSeverity;
  message: string;
  slideId?: string;
  elementId?: string;
  taskId?: string;
}

export interface ValidationReport {
  status: 'success' | 'warning' | 'error';
  protocol: string;
  checkedAt: string;
  slides: number;
  elements: number;
  aiTasks: {
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  };
  validation: {
    outOfBounds: number;
    missingTargets: number;
    duplicateIds: number;
    invalidSize: number;
    orphanTasks: number;
  };
  issues: ValidationIssue[];
}
