import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_FULL_AI_FORM } from '../ai/form';
import { MockAIProvider } from '../ai/mockProvider';
import { createDemoPresentation } from '../model/demo';
import { editorStore } from '../store/editorStore';

async function generated() {
  const form = { ...DEFAULT_FULL_AI_FORM, topic: '生成簡報', purpose: '測試完整流程', audience: '測試人員', slideCount: 3 };
  const provider = new MockAIProvider({ delayMs: 0 });
  return provider.generatePresentation(form, await provider.generateOutline(form));
}

describe('套用全 AI 生成結果', () => {
  beforeEach(() => editorStore.replacePresentation(createDemoPresentation(), { resetHistory: true }));

  it('可以建立成新簡報，並用復原回到原本簡報', async () => {
    const before = editorStore.getState().presentation.metadata.title;
    editorStore.applyGeneratedPresentation(await generated(), 'new');
    expect(editorStore.getState().presentation.metadata.title).toBe('生成簡報');
    editorStore.undo();
    expect(editorStore.getState().presentation.metadata.title).toBe(before);
  });

  it('可以加到目前簡報後面，整次只需要復原一次', async () => {
    const before = editorStore.getState().presentation.slides.length;
    editorStore.applyGeneratedPresentation(await generated(), 'append');
    expect(editorStore.getState().presentation.slides).toHaveLength(before + 3);
    editorStore.undo();
    expect(editorStore.getState().presentation.slides).toHaveLength(before);
    editorStore.redo();
    expect(editorStore.getState().presentation.slides).toHaveLength(before + 3);
  });

  it('附加到不同比例的簡報時會縮放到畫布內', async () => {
    const deck = await generated();
    deck.settings = { ...deck.settings, width: 1920, height: 1440, aspectRatio: '4:3' };
    editorStore.applyGeneratedPresentation(deck, 'append');
    const added = editorStore.getState().presentation.slides.slice(-3);
    expect(added.flatMap((slide) => slide.elements).every((element) => element.x + element.width <= 1920 && element.y + element.height <= 1080)).toBe(true);
  });

  it('可以取代目前簡報，並用復原還原', async () => {
    editorStore.applyGeneratedPresentation(await generated(), 'replace');
    expect(editorStore.getState().presentation.slides).toHaveLength(3);
    editorStore.undo();
    expect(editorStore.getState().presentation.slides).toHaveLength(5);
  });
});

