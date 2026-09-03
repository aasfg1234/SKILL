import { useEffect, useRef, useState } from 'react';
import { editorStore } from '../store/editorStore';
import type { ImageElement } from '../model/types';
import { CROP_HANDLES, moveCrop, resizeCrop, type CropHandle } from '../model/cropDrag';
import { normalizeCrop } from '../model/imageCrop';
import { sanitizeImageSrc } from '../model/sanitize';
import { LAYER } from '../lib/layers';

/**
 * 畫布上的拖框裁切。
 *
 * 進入裁切時，整張原圖會被拉滿元件框並調暗，
 * 亮的那一塊就是會保留的範圍。使用者直接拖那一塊或它的八個控制點。
 *
 * 因為原圖是「拉滿元件框」顯示的，所以畫面上移動幾個像素，
 * 換算成比例就是「除以元件寬高」，不需要知道原圖真正的尺寸。
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
  const crop = normalizeCrop(el.crop);
  const drag = useRef<DragState | null>(null);
  const [entryCrop] = useState(() => normalizeCrop(el.crop));
  const src = sanitizeImageSrc(el.src);

  const finish = () => editorStore.stopCrop();

  const cancel = () => {
    const back =
      entryCrop.x === 0 && entryCrop.y === 0 && entryCrop.w === 1 && entryCrop.h === 1
        ? undefined
        : entryCrop;
    editorStore.updateElement(el.id, { crop: back });
    editorStore.stopCrop();
  };

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
    e.preventDefault();
    drag.current = {
      handle,
      startX: e.clientX,
      startY: e.clientY,
      origin: { ...crop },
    };
    editorStore.beginTransaction();
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const move = (e: React.PointerEvent) => {
    const current = drag.current;
    if (!current) return;
    const dx = (e.clientX - current.startX) / zoom / el.width;
    const dy = (e.clientY - current.startY) / zoom / el.height;
    const next =
      current.handle === 'move'
        ? moveCrop(current.origin, dx, dy)
        : resizeCrop(current.origin, current.handle, dx, dy);
    editorStore.updateElement(el.id, { crop: next }, { transient: true });
  };

  const end = () => {
    if (!drag.current) return;
    drag.current = null;
    editorStore.endTransaction();
  };

  const box = { width: el.width, height: el.height };
  const rect = {
    left: crop.x * box.width,
    top: crop.y * box.height,
    width: crop.w * box.width,
    height: crop.h * box.height,
  };
  const handleSize = 14 / zoom;

  return (
    <div
      style={{
        position: 'absolute',
        left: el.x,
        top: el.y,
        width: box.width,
        height: box.height,
        zIndex: LAYER.canvasOverlay,
        cursor: 'default',
        touchAction: 'none',
      }}
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
            objectFit: 'fill',
            opacity: 0.35,
            pointerEvents: 'none',
          }}
        />
      )}

      <div
        style={{
          position: 'absolute',
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          overflow: 'hidden',
          outline: `${2 / zoom}px solid var(--color-brand)`,
          cursor: 'move',
          touchAction: 'none',
        }}
        onPointerDown={(e) => start(e, 'move')}
      >
        {src && (
          <img
            src={src}
            alt=""
            draggable={false}
            style={{
              position: 'absolute',
              left: -rect.left,
              top: -rect.top,
              width: box.width,
              height: box.height,
              maxWidth: 'none',
              maxHeight: 'none',
              objectFit: 'fill',
              pointerEvents: 'none',
            }}
          />
        )}
      </div>

      {CROP_HANDLES.map((handle) => {
        const left =
          handle.includes('w')
            ? rect.left
            : handle.includes('e')
              ? rect.left + rect.width
              : rect.left + rect.width / 2;
        const top =
          handle.includes('n')
            ? rect.top
            : handle.includes('s')
              ? rect.top + rect.height
              : rect.top + rect.height / 2;
        return (
          <div
            key={handle}
            onPointerDown={(e) => start(e, handle)}
            style={{
              position: 'absolute',
              left: left - handleSize / 2,
              top: top - handleSize / 2,
              width: handleSize,
              height: handleSize,
              background: 'var(--color-brand)',
              border: `${1.5 / zoom}px solid #fff`,
              borderRadius: 2 / zoom,
              cursor: HANDLE_CURSOR[handle],
              touchAction: 'none',
            }}
          />
        );
      })}

      <div
        style={{
          position: 'absolute',
          left: 0,
          top: -40 / zoom,
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
