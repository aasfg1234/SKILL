import { beforeEach, describe, expect, it } from 'vitest';
import { editorStore } from '../store/editorStore';
import { createDemoPresentation } from '../model/demo';
import { createImageElement } from '../model/factory';
import { imageRectOf, croppedBox } from '../model/cropDrag';
import type { ImageElement } from '../model/types';

/** 裁切之後元件框要縮成框起來的那一塊，而且保留範圍要真的存下來。 */

const BOX = { x: 100, y: 100, width: 800, height: 400 };

function setup() {
  editorStore.replacePresentation(createDemoPresentation(), { resetHistory: true });
  editorStore.selectSlide('slide-01');
  editorStore.addElement(createImageElement({ id: 'img-1', ...BOX, src: 'data:image/png;base64,AA' }));
}

function image(): ImageElement {
  const slide = editorStore
    .getState()
    .presentation.slides.find((s) => s.id === 'slide-01');
  return slide?.elements.find((e) => e.id === 'img-1') as ImageElement;
}

describe('完成裁切', () => {
  beforeEach(setup);

  it('元件框縮成框起來的那一塊，不會回到原圖尺寸', () => {
    const crop = { x: 0.25, y: 0, w: 0.5, h: 1 };

    editorStore.applyCrop('img-1', crop, croppedBox(imageRectOf(BOX, undefined), crop));

    expect(image().width).toBe(400);
    expect(image().x).toBe(300);
    expect(image().height).toBe(400);
  });

  it('保留範圍會真的存進元件裡', () => {
    const crop = { x: 0.25, y: 0, w: 0.5, h: 1 };

    editorStore.applyCrop('img-1', crop, croppedBox(imageRectOf(BOX, undefined), crop));

    expect(image().crop).toEqual(crop);
  });

  it('整張都保留時不留下裁切欄位，框也回到整張的大小', () => {
    const full = { x: 0, y: 0, w: 1, h: 1 };

    editorStore.applyCrop('img-1', full, croppedBox(imageRectOf(BOX, undefined), full));

    expect(image().crop).toBeUndefined();
    expect(image().width).toBe(800);
  });

  it('連續裁切兩次會愈裁愈小，不會跳回原圖', () => {
    const first = { x: 0, y: 0, w: 0.5, h: 1 };
    editorStore.applyCrop('img-1', first, croppedBox(imageRectOf(BOX, undefined), first));

    const el = image();
    const rect = imageRectOf({ x: el.x, y: el.y, width: el.width, height: el.height }, el.crop);
    expect(rect.width).toBe(800);

    const second = { x: 0, y: 0, w: 0.25, h: 1 };
    editorStore.applyCrop('img-1', second, croppedBox(rect, second));

    expect(image().width).toBe(200);
    expect(image().crop).toEqual(second);
  });

  it('裁切完會離開裁切模式', () => {
    editorStore.startCrop('img-1');
    const crop = { x: 0, y: 0, w: 0.5, h: 1 };

    editorStore.applyCrop('img-1', crop, croppedBox(imageRectOf(BOX, undefined), crop));

    expect(editorStore.getState().croppingId).toBeNull();
  });

  it('用數字改裁切也會跟著縮框', () => {
    editorStore.setCrop('img-1', { x: 0, y: 0, w: 0.5, h: 1 });

    expect(image().width).toBe(400);
    expect(image().crop).toEqual({ x: 0, y: 0, w: 0.5, h: 1 });
  });
});
