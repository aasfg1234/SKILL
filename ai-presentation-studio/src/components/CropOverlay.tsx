import { useEffect, useRef, useState } from 'react';
import { editorStore } from '../store/editorStore';
import type { ImageElement } from '../model/types';
import {
  CROP_HANDLES,
  croppedBox,
  imageRectOf,
  moveCrop,
  resizeCrop,
  type CropHandle,
} from '../model/cropDrag';
import { normalizeCrop } from '../model/imageCrop';
import { sanitizeImageSrc } from '../model/sanitize';
import { LAYER } from '../lib/layers';

/**
 * 畫布上的拖框裁切。
 *
 * 進入裁切時，整張原圖會照「目前這一塊放大的比例」攤開來並調暗，
 * 亮的那一塊就是目前的元件框。使用者拖亮框或八個控制點決定要留哪一塊。
 *
 * 按下完成之後，元件會縮成剛剛框起來的大小，
 * 所以畫面上看到的東西完全不會變形，也不會跳回原圖尺寸。
 */

const HANDLE_CURSOR: Record<CropHandle, string> = {
  nw: 'nwse-resize',
  n: 'ns-resize',
  ne: 'nesw-resize',
  e: 'ew-resize',
  se: 'nwse-resize',
  s: 'ns-resize',
  sw: 'nesw-resize',
  w: 'ew-resize',
};

interface DragState {
  handle: CropHandle | 'move';
  startX: number;
  startY: number;
  origin: { x: number; y: number; w: number; h: number };
}

export function CropOverlay({ el, zoom }: { el: ImageElement; zoom: number }) {
  // 整張原圖攤開後在投影片上的位置與大小；進入裁切時算一次就固定。
  const [image] = useState(() =>
    imageRectOf({ x: el.x, y: el.y, width: el.width, height: el.height }, el.crop),
  );
  const [crop, setCrop] = useState(() => normalizeCrop(el.crop));
  const drag = useRef<DragState | null>(null);
  const src = sanitizeImageSrc(el.src);

  const finish = () => editorStore.applyCrop(el.id, crop, croppedBox(image, crop));

  const cancel = () => editorStore.stopCrop();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        finish();
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  });

  const start = (e: React.PointerEvent, handle: CropHandle | 'move') => {
    e.stopPropagation();
    drag.current = { handle, startX: e.clientX, startY: e.clientY, origin: { ...crop } };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const move = (e: React.PointerEvent) => {
    const current = drag.current;
    if (!current) return;
    const dx = (e.clientX - current.startX) / zoom / image.width;
    const dy = (e.clientY - current.startY) / zoom / image.height;
    setCrop(
      current.handle === 'move'
        ? moveCrop(current.origin, dx, dy)
        : resizeCrop(current.origin, current.handle, dx, dy),
    );
  };

  const end = () => {
    drag.current = null;
  };

  // 抓到指標的元素自己收 move 與 up，跟畫布上其他控制點同一種寫法。
  const dragProps = (handle: CropHandle | 'move') => ({
    onPointerDown: (e: React.PointerEvent) => start(e, handle),
    onPointerMove: move,
    onPointerUp: end,
    onPointerCancel: end,
  });

  const frame = {
    left: crop.x * image.width,
    top: crop.y * image.height,
    width: crop.w * image.width,
    height: crop.h * image.height,
  };
  const handleSize = 16 / zoom;

  return (
    <div
      style={{
        position: 'absolute',
        left: image.x,
        top: image.y,
        width: image.width,
        height: image.height,
        zIndex: LAYER.canvasOverlay,
        touchAction: 'none',
      }}
      // 外層再收一次：move() 一律從按下去的起點重算，重複觸發不會有副作用。
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
      {src && (
        <img
          src={src}
          alt=""
          draggable={false}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            maxWidth: 'none',
            maxHeight: 'none',
            objectFit: 'fill',
            opacity: 0.3,
            pointerEvents: 'none',
          }}
        />
      )}

      <div
        style={{
          position: 'absolute',
          left: frame.left,
          top: frame.top,
          width: frame.width,
          height: frame.height,
          overflow: 'hidden',
          outline: `${2 / zoom}px solid var(--color-brand)`,
          cursor: 'move',
          touchAction: 'none',
        }}
        {...dragProps('move')}
      >
        {src && (
          <img
            src={src}
            alt=""
            draggable={false}
            style={{
              position: 'absolute',
              left: -frame.left,
              top: -frame.top,
              width: image.width,
              height: image.height,
              maxWidth: 'none',
              maxHeight: 'none',
              objectFit: 'fill',
              pointerEvents: 'none',
            }}
          />
        )}
      </div>

      {CROP_HANDLES.map((handle) => {
        const left = handle.includes('w')
          ? frame.left
          : handle.includes('e')
            ? frame.left + frame.width
            : frame.left + frame.width / 2;
        const top = handle.includes('n')
          ? frame.top
          : handle.includes('s')
            ? frame.top + frame.height
            : frame.top + frame.height / 2;
        return (
          <div
            key={handle}
            {...dragProps(handle)}
            style={{
              position: 'absolute',
              left: left - handleSize / 2,
              top: top - handleSize / 2,
              width: handleSize,
              height: handleSize,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: HANDLE_CURSOR[handle],
              touchAction: 'none',
            }}
          >
            <div
              style={{
                width: 10 / zoom,
                height: 10 / zoom,
                background: 'var(--color-brand)',
                border: `${1.5 / zoom}px solid #fff`,
                borderRadius: 2 / zoom,
              }}
            />
          </div>
        );
      })}

      <div
        style={{
          position: 'absolute',
          left: frame.left,
          top: frame.top - 40 / zoom,
          display: 'flex',
          gap: 8 / zoom,
          transform: `scale(${1 / zoom})`,
          transformOrigin: 'bottom left',
        }}
      >
        <button
          type="button"
          className="rounded-md px-3 py-1.5 text-[12px] font-medium"
          style={{ background: 'var(--color-brand)', color: 'var(--color-brand-ink)' }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={finish}
        >
          完成裁切
        </button>
        <button
          type="button"
          className="rounded-md px-3 py-1.5 text-[12px]"
          style={{ background: 'var(--color-panel)', border: '1px solid var(--color-line)' }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={cancel}
        >
          取消
        </button>
      </div>
    </div>
  );
}
