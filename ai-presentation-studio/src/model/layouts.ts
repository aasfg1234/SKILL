import {
  createImageElement,
  createLineElement,
  createRectElement,
  createTextElement,
} from './factory';
import type { SlideElement } from './types';

/**
 * 投影片版型。
 *
 * 新增投影片時如果只給一張全白，沒有排版經驗的人會不知道從哪裡開始。
 * 這裡提供幾個常用起點，使用者拿到之後再改文字即可。
 *
 * 版型只負責產生元素，不碰 store，也不碰畫面，所以可以單元測試。
 * 每個元素都必須明確指定 z，因為這些元素是直接放進投影片，
 * 不會經過 addElementToSlide 去自動決定層次。
 */

export interface LayoutOptions {
  width: number;
  height: number;
  /** 主題色，用在標題底下的色條 */
  accent: string;
}

export interface SlideLayout {
  id: string;
  name: string;
  description: string;
  build(options: LayoutOptions): SlideElement[];
}

const HEADING_SIZE = 76;
const BODY_SIZE = 36;
const MUTED = '#6B7280';
const INK = '#111827';

function heading(text: string, z: number): SlideElement {
  return createTextElement({
    text,
    x: 140,
    y: 110,
    width: 1640,
    height: 130,
    fontSize: HEADING_SIZE,
    bold: true,
    color: INK,
    align: 'left',
    verticalAlign: 'middle',
    z,
  });
}

function accentBar(accent: string, z: number): SlideElement {
  return createRectElement({
    x: 140,
    y: 258,
    width: 160,
    height: 10,
    radius: 5,
    fill: accent,
    strokeWidth: 0,
    z,
  });
}

function body(text: string, x: number, width: number, z: number): SlideElement {
  return createTextElement({
    text,
    x,
    y: 320,
    width,
    height: 600,
    fontSize: BODY_SIZE,
    color: INK,
    align: 'left',
    verticalAlign: 'top',
    lineHeight: 1.6,
    z,
  });
}

export const SLIDE_LAYOUTS: SlideLayout[] = [
  {
    id: 'blank',
    name: '空白',
    description: '完全空白，自己從頭排。',
    build: () => [],
  },
  {
    id: 'title',
    name: '標題頁',
    description: '大標題加副標題，適合封面或章節分隔。',
    build: ({ width, height, accent }) => [
      createRectElement({
        x: 0,
        y: 0,
        width,
        height,
        radius: 0,
        fill: '#F5F7FA',
        strokeWidth: 0,
        z: 1,
      }),
      createTextElement({
        text: '在這裡輸入標題',
        x: 200,
        y: 380,
        width: 1520,
        height: 180,
        fontSize: 112,
        bold: true,
        color: INK,
        align: 'left',
        verticalAlign: 'middle',
        z: 2,
      }),
      createLineElement({
        x: 200,
        y: 590,
        width: 220,
        height: 8,
        stroke: accent,
        strokeWidth: 8,
        z: 3,
      }),
      createTextElement({
        text: '在這裡輸入副標題',
        x: 200,
        y: 630,
        width: 1200,
        height: 90,
        fontSize: 44,
        color: MUTED,
        align: 'left',
        verticalAlign: 'middle',
        z: 4,
      }),
    ],
  },
  {
    id: 'title-content',
    name: '標題加內容',
    description: '一個標題配一段內文，最常用的一種。',
    build: ({ accent }) => [
      accentBar(accent, 1),
      heading('在這裡輸入標題', 2),
      body('在這裡輸入內容。', 140, 1640, 3),
    ],
  },
  {
    id: 'two-column',
    name: '兩欄',
    description: '左右各一欄，適合比較或並列說明。',
    build: ({ accent }) => [
      accentBar(accent, 1),
      heading('在這裡輸入標題', 2),
      body('左欄內容。', 140, 790, 3),
      body('右欄內容。', 990, 790, 4),
    ],
  },
  {
    id: 'image-text',
    name: '圖文',
    description: '左邊放圖，右邊放說明文字。',
    build: ({ accent }) => [
      accentBar(accent, 1),
      heading('在這裡輸入標題', 2),
      createImageElement({
        x: 140,
        y: 320,
        width: 860,
        height: 600,
        alt: '圖片',
        fit: 'cover',
        z: 3,
      }),
      body('在這裡輸入說明文字。', 1060, 720, 4),
    ],
  },
];

/** 依版型代號產生元素。認不得的代號一律當成空白。 */
export function buildLayoutElements(layoutId: string, options: LayoutOptions): SlideElement[] {
  const layout = SLIDE_LAYOUTS.find((item) => item.id === layoutId);
  return layout ? layout.build(options) : [];
}
