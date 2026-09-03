import { describe, expect, it } from 'vitest';
import { createPresentation, createSlide, createTextElement } from '../model/factory';
import { migratePresentationFonts } from '../model/migrate';
import { DEFAULT_FONT_ID, LEGACY_FONT_STACKS, fontStackOf } from '../lib/fonts';

const LEGACY = LEGACY_FONT_STACKS[0];
const MODERN = fontStackOf(DEFAULT_FONT_ID);

function legacyPresentation() {
  const p = createPresentation({
    slides: [
      createSlide({
        id: 'slide-01',
        elements: [
          createTextElement({ id: 'a', text: '舊的', fontFamily: LEGACY, z: 1 }),
          createTextElement({ id: 'b', text: '自訂', fontFamily: '"公司字型",sans-serif', z: 2 }),
          createTextElement({ id: 'c', text: '沒設定', z: 3 }),
        ],
      }),
    ],
  });
  p.theme.fontFamily = LEGACY;
  p.theme.headingFontFamily = LEGACY;
  return p;
}

describe('舊存檔的字型升級', () => {
  it('主題的字型會換成拉丁優先的新堆疊', () => {
    const next = migratePresentationFonts(legacyPresentation());

    expect(next.theme.fontFamily).toBe(MODERN);
    expect(next.theme.headingFontFamily).toBe(MODERN);
  });

  it('元素上的舊字型也會一起換掉', () => {
    const next = migratePresentationFonts(legacyPresentation());
    const [a] = next.slides[0].elements;

    expect(a.type === 'text' ? a.fontFamily : '').toBe(MODERN);
  });

  it('使用者自訂的字型與沒設定的元素都不會被動到', () => {
    const next = migratePresentationFonts(legacyPresentation());
    const [, b, c] = next.slides[0].elements;

    expect(b.type === 'text' ? b.fontFamily : '').toBe('"公司字型",sans-serif');
    expect(c.type === 'text' ? c.fontFamily : 'x').toBeUndefined();
  });

  it('已經是新版的簡報不會被改動', () => {
    const fresh = createPresentation({ slides: [createSlide({ id: 's1', masterKind: 'cover' })] });

    expect(migratePresentationFonts(fresh)).toEqual(fresh);
  });

  it('舊簡報會補上空白母片，並保留原本的每頁背景', () => {
    const old = createPresentation({
      slides: [createSlide({ id: 's1', background: '#123456' })],
    });
    delete old.masters;
    delete old.master;
    delete old.slides[0].useMasterBackground;
    delete old.slides[0].masterKind;

    const next = migratePresentationFonts(old);

    expect(next.masters?.cover).toMatchObject({ id: 'master-cover', background: '#FFFFFF', elements: [] });
    expect(next.masters?.content).toMatchObject({ id: 'master-content', background: '#FFFFFF', elements: [] });
    expect(next.slides[0].masterKind).toBe('cover');
    expect(next.slides[0].useMasterBackground).toBe(false);
    expect(next.slides[0].background).toBe('#123456');
  });

  it('單一舊母片會複製成封面母片與內容母片', () => {
    const old = createPresentation({ slides: [createSlide({ id: 's1' }), createSlide({ id: 's2' })] });
    old.master = createSlide({
      id: 'master-slide',
      title: '舊母片',
      elements: [createTextElement({ id: 'legacy-footer', text: '舊共用頁尾' })],
    });
    delete old.masters;

    const next = migratePresentationFonts(old);

    expect(next.masters?.cover.elements[0]).toMatchObject({ text: '舊共用頁尾' });
    expect(next.masters?.content.elements[0]).toMatchObject({ text: '舊共用頁尾' });
    expect(next.masters?.cover.elements[0].id).not.toBe(next.masters?.content.elements[0].id);
    expect(next.slides.map((slide) => slide.masterKind)).toEqual(['cover', 'content']);
  });
});
