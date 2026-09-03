import type { MasterKind, Presentation, Slide, SlideElement } from './types';
import { migrateFontStack } from '../lib/fonts';
import { createSlide } from './factory';

/** 舊存檔升級：字型、雙母片與原本的投影片背景。 */

function migrateElementFont(el: SlideElement): SlideElement {
  if (el.type !== 'text' && el.type !== 'table') return el;
  const next = migrateFontStack(el.fontFamily);
  return next === el.fontFamily ? el : { ...el, fontFamily: next };
}

function migratedMaster(slide: Slide): Slide {
  return { ...slide, elements: slide.elements.map(migrateElementFont) };
}

function emptyMaster(kind: MasterKind): Slide {
  return createSlide({
    id: `master-${kind}`,
    title: kind === 'cover' ? '封面母片' : '內容母片',
    background: '#FFFFFF',
    useMasterBackground: false,
  });
}

function copyLegacyMaster(slide: Slide, kind: MasterKind): Slide {
  const groupIds = new Map<string, string>();
  return {
    ...structuredClone(slide),
    id: `master-${kind}`,
    title: kind === 'cover' ? '封面母片' : '內容母片',
    elements: slide.elements.map((element) => {
      const copy = structuredClone(element);
      copy.id = `${kind}-${copy.id}`;
      if (copy.groupId) {
        const next = groupIds.get(copy.groupId) ?? `${kind}-${copy.groupId}`;
        groupIds.set(copy.groupId, next);
        copy.groupId = next;
      }
      return copy;
    }),
  };
}

export function migratePresentationFonts(presentation: Presentation): Presentation {
  const themeFont = migrateFontStack(presentation.theme.fontFamily);
  const headingFont = migrateFontStack(presentation.theme.headingFontFamily);
  const hadAnyMaster = Boolean(presentation.master || presentation.masters);

  const masters = presentation.masters
    ? {
        cover: migratedMaster(presentation.masters.cover),
        content: migratedMaster(presentation.masters.content),
      }
    : presentation.master
      ? {
          cover: copyLegacyMaster(presentation.master, 'cover'),
          content: copyLegacyMaster(presentation.master, 'content'),
        }
      : { cover: emptyMaster('cover'), content: emptyMaster('content') };

  let changed =
    !presentation.masters ||
    themeFont !== presentation.theme.fontFamily ||
    headingFont !== presentation.theme.headingFontFamily ||
    masters.cover.elements.some((el, i) => el !== presentation.masters?.cover.elements[i]) ||
    masters.content.elements.some((el, i) => el !== presentation.masters?.content.elements[i]);

  const slides = presentation.slides.map((slide, index) => {
    const elements = slide.elements.map(migrateElementFont);
    const useMasterBackground = slide.useMasterBackground ?? (hadAnyMaster ? true : false);
    const masterKind = slide.masterKind ?? (index === 0 ? 'cover' : 'content');
    if (
      elements.some((el, i) => el !== slide.elements[i]) ||
      slide.useMasterBackground !== useMasterBackground ||
      slide.masterKind !== masterKind
    ) {
      changed = true;
      return { ...slide, elements, useMasterBackground, masterKind };
    }
    return slide;
  });

  if (!changed) return presentation;

  const { master: _legacyMaster, ...withoutLegacy } = presentation;
  return {
    ...withoutLegacy,
    theme: {
      ...presentation.theme,
      fontFamily: themeFont ?? presentation.theme.fontFamily,
      headingFontFamily: headingFont ?? presentation.theme.headingFontFamily,
    },
    masters,
    slides,
  };
}
