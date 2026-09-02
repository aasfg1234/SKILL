import type { Presentation, SlideElement } from './types';
import { migrateFontStack } from '../lib/fonts';

/**
 * 舊存檔升級。
 *
 * 這個專案的資料存在瀏覽器的 localStorage，也可能來自使用者匯入的 JSON，
 * 不會自動跟著程式版本更新。每次改動資料格式，都要在這裡補上對應的升級。
 *
 * 目前處理的項目：
 * 1. 字型堆疊由「中文字型優先」換成「拉丁字型優先」，避免換系統跑版。
 */

function migrateElementFont(el: SlideElement): SlideElement {
  if (el.type !== 'text' && el.type !== 'table') return el;
  const next = migrateFontStack(el.fontFamily);
  return next === el.fontFamily ? el : { ...el, fontFamily: next };
}

export function migratePresentationFonts(presentation: Presentation): Presentation {
  const themeFont = migrateFontStack(presentation.theme.fontFamily);
  const headingFont = migrateFontStack(presentation.theme.headingFontFamily);
  let changed =
    themeFont !== presentation.theme.fontFamily ||
    headingFont !== presentation.theme.headingFontFamily;

  const slides = presentation.slides.map((slide) => {
    const elements = slide.elements.map(migrateElementFont);
    if (elements.some((el, i) => el !== slide.elements[i])) {
      changed = true;
      return { ...slide, elements };
    }
    return slide;
  });

  if (!changed) return presentation;

  return {
    ...presentation,
    theme: {
      ...presentation.theme,
      fontFamily: themeFont ?? presentation.theme.fontFamily,
      headingFontFamily: headingFont ?? presentation.theme.headingFontFamily,
    },
    slides,
  };
}
