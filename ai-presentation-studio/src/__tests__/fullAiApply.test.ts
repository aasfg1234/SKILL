import { beforeEach, describe, expect, it } from 'vitest';
import { createPresentation, createSlide, createTextElement } from '../model/factory';
import { createDemoPresentation } from '../model/demo';
import { editorStore } from '../store/editorStore';
import type { Presentation } from '../model/types';

/** 一份跟外部 AI 交接回來的簡報會長什麼樣子的假資料，不依賴任何生成器。 */
function fixtureDeck(overrides: Partial<Presentation['settings']> = {}): Presentation {
  return createPresentation({
    metadata: {
      id: 'ext-deck-1',
      title: '生成簡報',
      author: '',
      description: '',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    settings: { width: 1920, height: 1080, aspectRatio: '16:9', ...overrides },
    slides: [
      createSlide({ id: 'g-1', title: '封面', masterKind: 'cover', elements: [createTextElement({ id: 'g-1-t', text: '生成簡報' })] }),
      createSlide({ id: 'g-2', title: '內容一', masterKind: 'content', elements: [createTextElement({ id: 'g-2-t', text: '內容一' })] }),
      createSlide({ id: 'g-3', title: '內容二', masterKind: 'content', elements: [createTextElement({ id: 'g-3-t', text: '內容二' })] }),
    ],
  });
}

describe('套用全 AI 生成結果', () => {
  beforeEach(() => editorStore.replacePresentation(createDemoPresentation(), { resetHistory: true }));

  it('可以建立成新簡報，並用復原回到原本簡報', () => {
    const before = editorStore.getState().presentation.metadata.title;
    editorStore.applyGeneratedPresentation(fixtureDeck(), 'new');
    expect(editorStore.getState().presentation.metadata.title).toBe('生成簡報');
    editorStore.undo();
    expect(editorStore.getState().presentation.metadata.title).toBe(before);
  });

  it('可以加到目前簡報後面，整次只需要復原一次', () => {
    const before = editorStore.getState().presentation.slides.length;
    editorStore.applyGeneratedPresentation(fixtureDeck(), 'append');
    expect(editorStore.getState().presentation.slides).toHaveLength(before + 3);
    editorStore.undo();
    expect(editorStore.getState().presentation.slides).toHaveLength(before);
    editorStore.redo();
    expect(editorStore.getState().presentation.slides).toHaveLength(before + 3);
  });

  it('附加到不同比例的簡報時會縮放到畫布內', () => {
    const deck = fixtureDeck({ width: 1920, height: 1440, aspectRatio: '4:3' });
    editorStore.applyGeneratedPresentation(deck, 'append');
    const added = editorStore.getState().presentation.slides.slice(-3);
    expect(added.flatMap((slide) => slide.elements).every((element) => element.x + element.width <= 1920 && element.y + element.height <= 1080)).toBe(true);
  });

  it('可以取代目前簡報，並用復原還原', () => {
    editorStore.applyGeneratedPresentation(fixtureDeck(), 'replace');
    expect(editorStore.getState().presentation.slides).toHaveLength(3);
    editorStore.undo();
    expect(editorStore.getState().presentation.slides).toHaveLength(5);
  });
});
