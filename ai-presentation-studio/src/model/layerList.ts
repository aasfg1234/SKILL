import type { ElementType, Slide, SlideElement } from './types';
import { ELEMENT_TYPE_LABELS, AI_KIND_LABELS } from '../lib/labels';

/**
 * 圖層清單。
 *
 * 由上而下排列，跟畫布上看到的疊放順序一致：排第一個的就是蓋在最上面的。
 * 只負責算出「要顯示什麼」，不碰畫面也不碰 store。
 */

const MAX_LABEL = 12;

export interface LayerItem {
  id: string;
  type: ElementType;
  label: string;
  locked: boolean;
  hidden: boolean;
  z: number;
}

function truncate(value: string): string {
  const text = value.replace(/\s+/g, ' ').trim();
  return text.length > MAX_LABEL ? `${text.slice(0, MAX_LABEL)}…` : text;
}

function labelOf(el: SlideElement): string {
  if (el.name && el.name.trim()) return truncate(el.name);

  switch (el.type) {
    case 'text':
      return truncate(el.text) || ELEMENT_TYPE_LABELS.text;
    case 'table':
      return `表格 ${el.cells.length}×${el.cells[0]?.length ?? 0}`;
    case 'image':
      return truncate(el.alt) || ELEMENT_TYPE_LABELS.image;
    case 'ai_component':
      return `AI ${AI_KIND_LABELS[el.kind]}　${el.taskId}`;
    default:
      return ELEMENT_TYPE_LABELS[el.type];
  }
}

export function buildLayerList(slide: Slide): LayerItem[] {
  return [...slide.elements]
    .sort((a, b) => b.z - a.z)
    .map((el) => ({
      id: el.id,
      type: el.type,
      label: labelOf(el),
      locked: el.locked,
      hidden: el.hidden,
      z: el.z,
    }));
}
