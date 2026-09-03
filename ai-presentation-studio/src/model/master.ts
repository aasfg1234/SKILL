import type { MasterKind, Presentation, Slide } from './types';

export function masterKindForSlide(slide: Slide, index: number): MasterKind {
  return slide.masterKind ?? (index === 0 ? 'cover' : 'content');
}

export function masterForSlide(
  presentation: Presentation,
  slide: Slide,
  index: number,
): Slide | undefined {
  return presentation.masters?.[masterKindForSlide(slide, index)];
}

export function effectiveSlideBackground(
  presentation: Presentation,
  slide: Slide,
  index: number,
): string {
  if (!slide.useMasterBackground) return slide.background;
  return masterForSlide(presentation, slide, index)?.background ?? slide.background;
}
