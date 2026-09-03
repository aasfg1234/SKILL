import type { AIComponentKind, AIOutputFormat, AIStatus, ElementType } from '../model/types';

/** 使用者看到的文字一律繁體中文；程式碼與 JSON 欄位維持英文。 */

export const AI_KIND_LABELS: Record<AIComponentKind, string> = {
  text: '文字',
  image: '圖片',
  chart: '圖表',
  diagram: '流程圖',
  timeline: '時間軸',
  table: '表格',
  infographic: '資訊圖表',
  custom: '自訂',
};

export const AI_FORMAT_LABELS: Record<AIOutputFormat, string> = {
  svg: 'SVG（向量圖，建議）',
  html: 'HTML 片段',
  text: '純文字',
  json: 'JSON 資料',
  image: '圖片（data URL）',
};

export const AI_STATUS_LABELS: Record<AIStatus, string> = {
  pending: '等待 AI 處理',
  processing: 'AI 處理中',
  completed: 'AI 已完成',
  error: 'AI 處理失敗',
};

export const AI_STATUS_ICON: Record<AIStatus, string> = {
  pending: '✨',
  processing: '⟳',
  completed: '✓',
  error: '⚠',
};

export const ELEMENT_TYPE_LABELS: Record<ElementType, string> = {
  text: '文字',
  rect: '矩形',
  ellipse: '圓形',
  line: '線條',
  shape: '圖形',
  image: '圖片',
  table: '表格',
  chart: '圖表',
  ai_component: 'AI 元件',
};

export const AI_KIND_ORDER: AIComponentKind[] = [
  'text',
  'image',
  'chart',
  'diagram',
  'timeline',
  'table',
  'infographic',
  'custom',
];

export const AI_FORMAT_ORDER: AIOutputFormat[] = ['svg', 'html', 'text', 'json', 'image'];

/** 依 AI 類型建議的輸出格式。 */
export function suggestedFormat(kind: AIComponentKind): AIOutputFormat {
  switch (kind) {
    case 'text':
      return 'text';
    case 'image':
      return 'image';
    case 'table':
    case 'chart':
    case 'diagram':
    case 'timeline':
    case 'infographic':
      return 'svg';
    default:
      return 'svg';
  }
}
