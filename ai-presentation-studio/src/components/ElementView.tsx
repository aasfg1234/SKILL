import type { CSSProperties } from 'react';
import { sanitizeAiOutput, sanitizeImageSrc } from '../model/sanitize';
import type { AIComponentElement, SlideElement } from '../model/types';
import { AI_KIND_LABELS, AI_STATUS_ICON, AI_STATUS_LABELS } from '../lib/labels';
import { formatListLines, normalizeListStyle } from '../model/textList';
import { buildLineSvg, buildShapeSvg } from '../model/shapes';
import { cropImageStyle } from '../model/imageCrop';
import { isCoveredCell, mergeCovering } from '../model/table';
import { buildChartSvg } from '../model/chartDraw';

/**
 * 畫布 / 縮圖 / 播放模式共用的元素外觀。
 *
 * 注意：這是「編輯器端」的呈現。真正輸出的 HTML 由 src/renderer 產生，
 * 兩者刻意分離，Renderer 不依賴任何 React 元件。
 */

export type ViewMode = 'edit' | 'thumb' | 'present';

function boxStyle(el: SlideElement): CSSProperties {
  return {
    position: 'absolute',
    left: el.x,
    top: el.y,
    width: el.width,
    height: el.height,
    opacity: el.opacity,
    transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
  };
}

function AiComponentView({ el, mode }: { el: AIComponentElement; mode: ViewMode }) {
  const completed = el.status === 'completed' && el.result;
  const showChrome = mode !== 'present';

  if (completed && el.result) {
    const clean = sanitizeAiOutput(el.result.type, el.result.content);
    let body: React.ReactNode = null;
    if (el.result.type === 'svg' || el.result.type === 'html') {
      body = (
        <div
          className="h-full w-full [&>svg]:h-full [&>svg]:w-full"
          dangerouslySetInnerHTML={{ __html: clean.content }}
        />
      );
    } else if (el.result.type === 'image') {
      const src = sanitizeImageSrc(clean.content);
      body = src ? (
        <img src={src} alt={el.prompt.slice(0, 40)} className="h-full w-full object-contain" />
      ) : null;
    } else if (el.result.type === 'json') {
      body = (
        <pre
          className="h-full w-full overflow-auto rounded-xl bg-panel-2 p-6 font-mono"
          style={{ fontSize: 20 }}
        >
          {clean.content}
        </pre>
      );
    } else {
      body = (
        <div
          className="flex h-full w-full flex-col justify-center whitespace-pre-wrap"
          style={{ fontSize: 36, lineHeight: 1.6 }}
        >
          {clean.content}
        </div>
      );
    }

    return (
      <div className="ai-shell" data-status="completed">
        {body}
        {showChrome && (
          <div
            className="pointer-events-none absolute right-3 top-3 rounded-full bg-brand/90 px-4 py-1.5 font-bold text-brand-ink"
            style={{ fontSize: 20 }}
          >
            ✓ AI 已完成
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="ai-shell" data-status={el.status}>
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-8 text-center">
        <div
          className="rounded-full border-2 px-6 py-2 font-bold"
          style={{
            fontSize: 26,
            borderColor: el.status === 'error' ? 'var(--color-danger)' : 'var(--color-brand)',
            color: el.status === 'error' ? 'var(--color-danger)' : 'var(--color-brand)',
          }}
        >
          ✨ AI {AI_KIND_LABELS[el.kind]}
        </div>
        <div
          className="font-bold"
          style={{
            fontSize: 44,
            color: el.status === 'error' ? 'var(--color-danger)' : 'var(--color-ink)',
          }}
        >
          <span className={el.status === 'processing' ? 'aps-spin inline-block' : undefined}>
            {AI_STATUS_ICON[el.status]}
          </span>{' '}
          {AI_STATUS_LABELS[el.status]}
        </div>
        <div
          className="max-w-[80%] whitespace-pre-wrap"
          style={{ fontSize: 24, color: 'var(--color-ink-2)', lineHeight: 1.6 }}
        >
          {el.errorMessage || el.prompt || '尚未填寫 Prompt'}
        </div>
        {el.status !== 'error' && (
          <div style={{ fontSize: 20, color: 'var(--color-ink-3)' }}>
            任務 {el.taskId}　·　輸出 {el.outputFormat.toUpperCase()}
          </div>
        )}
      </div>
    </div>
  );
}

export function ElementView({ el, mode }: { el: SlideElement; mode: ViewMode }) {
  if (el.hidden && mode !== 'edit') return null;

  const style = boxStyle(el);
  if (el.hidden) style.opacity = 0.25;

  switch (el.type) {
    case 'text':
      return (
        <div
          style={{
            ...style,
            display: 'flex',
            flexDirection: 'column',
            justifyContent:
              el.verticalAlign === 'top'
                ? 'flex-start'
                : el.verticalAlign === 'bottom'
                  ? 'flex-end'
                  : 'center',
            textAlign: el.align,
            fontSize: el.fontSize,
            fontWeight: el.bold ? 700 : 400,
            fontStyle: el.italic ? 'italic' : 'normal',
            textDecoration: el.underline ? 'underline' : 'none',
            color: el.color,
            lineHeight: el.lineHeight,
            letterSpacing: el.letterSpacing,
            fontFamily: el.fontFamily,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {normalizeListStyle(el.listStyle) === 'none'
            ? formatListLines(el.text, 'none').map((line, index) => (
                <div key={index} style={{ paddingLeft: `${line.level * 1.6}em` }}>
                  <span
                    data-aps-text={mode === 'edit' ? '1' : undefined}
                    style={{
                      pointerEvents: mode === 'edit' ? 'auto' : undefined,
                      cursor: mode === 'edit' ? 'text' : undefined,
                    }}
                  >
                    {line.text || ' '}
                  </span>
                </div>
              ))
            : formatListLines(el.text, el.listStyle).map((line, index) => (
                <div
                  key={index}
                  style={{
                    display: 'flex',
                    gap: '0.5em',
                    paddingLeft: `${line.level * 1.6}em`,
                    textAlign: el.align,
                    justifyContent:
                      el.align === 'center'
                        ? 'center'
                        : el.align === 'right'
                          ? 'flex-end'
                          : 'flex-start',
                  }}
                >
                  {line.marker && (
                    <span style={{ flex: '0 0 auto', opacity: 0.75 }}>{line.marker}</span>
                  )}
                  <span
                    data-aps-text={mode === 'edit' ? '1' : undefined}
                    style={{
                      flex: '0 1 auto',
                      pointerEvents: mode === 'edit' ? 'auto' : undefined,
                      cursor: mode === 'edit' ? 'text' : undefined,
                    }}
                  >
                    {line.text || ' '}
                  </span>
                </div>
              ))}
        </div>
      );
    case 'table': {
      const rows = el.cells.length;
      return (
        <div style={{ ...style, overflow: 'hidden' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: el.columnWidths.map((w) => `${w}fr`).join(' '),
              gridTemplateRows: `repeat(${rows}, ${100 / Math.max(1, rows)}%)`,
              width: '100%',
              height: '100%',
              fontSize: el.fontSize,
              color: el.color,
              fontFamily: el.fontFamily,
            }}
          >
            {el.cells.map((line, row) =>
              line.map((cell, col) => {
                if (isCoveredCell(el, row, col)) return null;
                const merge = mergeCovering(el, row, col);
                return (
                <div
                  key={`${row}-${col}`}
                  style={{
                    gridColumn: `${col + 1} / span ${merge?.colSpan ?? 1}`,
                    gridRow: `${row + 1} / span ${merge?.rowSpan ?? 1}`,
                    display: 'flex',
                    alignItems: 'center',
                    padding: el.cellPadding,
                    borderRight: `1px solid ${el.borderColor}`,
                    borderBottom: `1px solid ${el.borderColor}`,
                    borderTop: row === 0 ? `1px solid ${el.borderColor}` : undefined,
                    borderLeft: col === 0 ? `1px solid ${el.borderColor}` : undefined,
                    background: el.headerRow && row === 0 ? el.headerFill : undefined,
                    fontWeight: el.headerRow && row === 0 ? 700 : 400,
                    overflow: 'hidden',
                    wordBreak: 'break-word',
                  }}
                >
                  {cell}
                </div>
                );
              }),
            )}
          </div>
        </div>
      );
    }
    case 'chart':
      return (
        <div
          style={{ ...style, overflow: 'hidden' }}
          dangerouslySetInnerHTML={{ __html: buildChartSvg(el) }}
        />
      );
    case 'rect':
      return (
        <div
          style={{
            ...style,
            background: el.fill,
            border: el.strokeWidth > 0 ? `${el.strokeWidth}px solid ${el.stroke}` : undefined,
            borderRadius: el.radius,
          }}
        />
      );
    case 'ellipse':
      return (
        <div
          style={{
            ...style,
            background: el.fill,
            border: el.strokeWidth > 0 ? `${el.strokeWidth}px solid ${el.stroke}` : undefined,
            borderRadius: '50%',
          }}
        />
      );
    case 'line':
      return (
        <div
          style={style}
          dangerouslySetInnerHTML={{
            __html: buildLineSvg({
              width: el.width,
              height: el.height,
              stroke: el.stroke,
              strokeWidth: el.strokeWidth,
              arrowStart: el.arrowStart,
              arrowEnd: el.arrowEnd,
            }),
          }}
        />
      );
    case 'shape':
      return (
        <div
          style={style}
          dangerouslySetInnerHTML={{
            __html: buildShapeSvg({
              shape: el.shape,
              width: el.width,
              height: el.height,
              fill: el.fill,
              stroke: el.stroke,
              strokeWidth: el.strokeWidth,
            }),
          }}
        />
      );
    case 'image': {
      const src = sanitizeImageSrc(el.src);
      return (
        <div style={{ ...style, overflow: 'hidden', borderRadius: el.radius }}>
          {src ? (
            <img src={src} alt={el.alt} style={cropImageStyle(el.crop, el.fit)} />
          ) : (
            <div
              className="flex h-full w-full items-center justify-center border-2 border-dashed"
              style={{
                borderColor: 'var(--color-ink-3)',
                color: 'var(--color-ink-3)',
                fontSize: 28,
              }}
            >
              尚未選擇圖片
            </div>
          )}
        </div>
      );
    }
    case 'ai_component':
      return (
        <div style={style}>
          <AiComponentView el={el} mode={mode} />
        </div>
      );
    default:
      return null;
  }
}

export function sortByZ(elements: SlideElement[]): SlideElement[] {
  return [...elements].sort((a, b) => a.z - b.z);
}
