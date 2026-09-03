import type { Presentation, Slide } from './types';
import { masterKindForSlide } from './master';

/**
 * 投影片層級的規則：哪些要播、頁碼怎麼算。
 *
 * 編輯器、預覽、縮圖與匯出 HTML 四邊都用這一份，才不會四種地方數字不一樣。
 */

export interface SlideNumberBox {
  text: string;
  /** 距離投影片右邊界的距離（px） */
  right: number;
  /** 距離投影片下邊界的距離（px） */
  bottom: number;
  fontSize: number;
  color: string;
  fontFamily: string;
}

export function isSlideHidden(slide: Slide): boolean {
  return slide.hidden === true;
}

/** 播放與匯出時真正會出現的投影片。 */
export function visibleSlides(presentation: Presentation): Slide[] {
  return presentation.slides.filter((slide) => !isSlideHidden(slide));
}

/**
 * 第 index 張投影片要顯示的頁碼；不顯示時回傳 null。
 *
 * 頁碼只數沒有被隱藏的投影片。封面即使不顯示頁碼，仍然佔一個號碼，
 * 這樣使用者關掉封面頁碼之後，第二張還是「2」，不會整份往前跳一號。
 */
export function slideNumberFor(presentation: Presentation, index: number): SlideNumberBox | null {
  if (presentation.settings.showSlideNumbers !== true) return null;

  const slide = presentation.slides[index];
  if (!slide || isSlideHidden(slide)) return null;
  if (
    presentation.settings.hideNumberOnCover === true &&
    masterKindForSlide(slide, index) === 'cover'
  ) {
    return null;
  }

  let number = 0;
  for (let i = 0; i <= index; i += 1) {
    if (!isSlideHidden(presentation.slides[i])) number += 1;
  }

  const height = presentation.settings.height;
  return {
    text: String(number),
    right: Math.round(height * 0.035),
    bottom: Math.round(height * 0.028),
    fontSize: Math.max(12, Math.round(height * 0.022)),
    color: presentation.theme.palette.muted,
    fontFamily: presentation.theme.fontFamily,
  };
}
