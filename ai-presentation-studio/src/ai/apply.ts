import { newElementId, newGroupId, newSlideId } from '../model/ids';
import type { Presentation, Slide, SlideElement } from '../model/types';

function scaledElement(element: SlideElement, scaleX: number, scaleY: number): SlideElement {
  const next = structuredClone(element);
  next.id = newElementId(element.type);
  next.x = Math.round(element.x * scaleX);
  next.y = Math.round(element.y * scaleY);
  next.width = Math.max(1, Math.round(element.width * scaleX));
  next.height = Math.max(1, Math.round(element.height * scaleY));
  return next;
}

/** 把生成簡報的投影片安全加入另一份簡報，並確保 ID 與尺寸不衝突。 */
export function prepareSlidesForAppend(current: Presentation, generated: Presentation): Slide[] {
  const scaleX = current.settings.width / generated.settings.width;
  const scaleY = current.settings.height / generated.settings.height;
  return generated.slides.map((slide) => {
    const groups = new Map<string, string>();
    const elements = slide.elements.map((element) => {
      const next = scaledElement(element, scaleX, scaleY);
      if (element.groupId) {
        const groupId = groups.get(element.groupId) ?? newGroupId();
        groups.set(element.groupId, groupId);
        next.groupId = groupId;
      }
      return next;
    });
    return {
      ...structuredClone(slide),
      id: newSlideId(),
      elements,
    };
  });
}

