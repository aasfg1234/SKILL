import { escapeHtml, sanitizeAiOutput, sanitizeImageSrc } from '../model/sanitize';
import type { AIComponentElement, SlideElement } from '../model/types';
import { formatListLines, normalizeListStyle } from '../model/textList';
import { isCoveredCell, mergeCovering } from '../model/table';
import { buildChartSvg } from '../model/chartDraw';

/**
 * 元素 → HTML 片段。
 *
 * 這一層刻意不依賴 React 或任何 UI 套件，
 * 讓「Completed Spec → HTML」可以在編輯器之外獨立執行。
 */

function styleString(style: Record<string, string | number | undefined>): string {
  return Object.entries(style)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}:${v}`)
    .join(';');
}

function boxStyle(el: SlideElement): Record<string, string | number> {
  const style: Record<string, string | number> = {
    position: 'absolute',
    left: `${el.x}px`,
    top: `${el.y}px`,
    width: `${el.width}px`,
    height: `${el.height}px`,
    opacity: String(el.opacity ?? 1),
  };
  if (el.rotation) style.transform = `rotate(${el.rotation}deg)`;
  return style;
}

const AI_KIND_LABEL: Record<string, string> = {
  text: '文字',
  image: '圖片',
  chart: '圖表',
  diagram: '流程圖',
  timeline: '時間軸',
  table: '表格',
  infographic: '資訊圖表',
  custom: '自訂',
};

export function aiKindLabel(kind: string): string {
  return AI_KIND_LABEL[kind] ?? kind;
}

/** AI 元件已完成時的內容輸出（已通過安全過濾）。 */
export function renderAiResult(el: AIComponentElement): string {
  if (!el.result) return '';
  const { content } = sanitizeAiOutput(el.result.type, el.result.content);
  if (!content.trim()) return '';

  switch (el.result.type) {
    case 'svg':
      return `<div class="aps-ai-svg">${content}</div>`;
    case 'html':
      return `<div class="aps-ai-html">${content}</div>`;
    case 'image': {
      const src = sanitizeImageSrc(content);
      return src
        ? `<img class="aps-ai-image" src="${escapeHtml(src)}" alt="${escapeHtml(el.prompt.slice(0, 60))}" />`
        : '';
    }
    case 'json':
      return `<pre class="aps-ai-json">${escapeHtml(content)}</pre>`;
    case 'text':
    default:
      return `<div class="aps-ai-text">${escapeHtml(content).replace(/\n/g, '<br />')}</div>`;
  }
}

function renderAiComponent(el: AIComponentElement): string {
  const style = styleString(boxStyle(el));
  if (el.status === 'completed' && el.result) {
    const body = renderAiResult(el);
    if (body) return `<div class="aps-el aps-ai aps-ai-completed" style="${style}">${body}</div>`;
  }
  const statusText =
    el.status === 'error'
      ? '⚠ AI 處理失敗'
      : el.status === 'processing'
        ? '⟳ AI 處理中'
        : '✨ 等待 AI 處理';
  return `<div class="aps-el aps-ai aps-ai-${el.status}" style="${style}">
      <div class="aps-ai-placeholder">
        <div class="aps-ai-badge">${escapeHtml(`AI ${aiKindLabel(el.kind)}`)}</div>
        <div class="aps-ai-status">${escapeHtml(statusText)}</div>
        <div class="aps-ai-prompt">${escapeHtml(el.prompt)}</div>
      </div>
    </div>`;
}

/** 將單一元素轉為 HTML 字串。 */
export function renderElementToHtml(el: SlideElement): string {
  if (el.hidden) return '';

  switch (el.type) {
    case 'text': {
      const style = styleString({
        ...boxStyle(el),
        display: 'flex',
        'flex-direction': 'column',
        'justify-content':
          el.verticalAlign === 'top'
            ? 'flex-start'
            : el.verticalAlign === 'bottom'
              ? 'flex-end'
              : 'center',
        'text-align': el.align,
        'font-size': `${el.fontSize}px`,
        'font-weight': el.bold ? 700 : 400,
        'font-style': el.italic ? 'italic' : 'normal',
        'text-decoration': el.underline ? 'underline' : 'none',
        color: el.color,
        'line-height': String(el.lineHeight),
        'letter-spacing': `${el.letterSpacing}px`,
        'font-family': el.fontFamily,
        'white-space': 'pre-wrap',
        'word-break': 'break-word',
      });
      if (normalizeListStyle(el.listStyle) === 'none') {
        return `<div class="aps-el aps-text" style="${style}">${escapeHtml(el.text)}</div>`;
      }
      const justify =
        el.align === 'center' ? 'center' : el.align === 'right' ? 'flex-end' : 'flex-start';
      const lines = formatListLines(el.text, el.listStyle)
        .map((line) => {
          const marker = line.marker
            ? `<span style="flex:0 0 auto;opacity:.75">${escapeHtml(line.marker)}</span>`
            : '';
          return `<div style="display:flex;gap:.5em;justify-content:${justify}">${marker}<span style="flex:0 1 auto">${escapeHtml(line.text) || '&nbsp;'}</span></div>`;
        })
        .join('');
      return `<div class="aps-el aps-text" style="${style}">${lines}</div>`;
    }
    case 'table': {
      const rows = el.cells.length;
      const outer = styleString({ ...boxStyle(el), overflow: 'hidden' });
      const grid = styleString({
        display: 'grid',
        'grid-template-columns': el.columnWidths.map((w) => `${w}fr`).join(' '),
        'grid-template-rows': `repeat(${rows}, ${100 / Math.max(1, rows)}%)`,
        width: '100%',
        height: '100%',
        'font-size': `${el.fontSize}px`,
        color: el.color,
        'font-family': el.fontFamily,
      });
      const cells = el.cells
        .map((line, row) =>
          line
            .map((cell, col) => {
              if (isCoveredCell(el, row, col)) return '';
              const merge = mergeCovering(el, row, col);
              const cellStyle = styleString({
                'grid-column': `${col + 1} / span ${merge?.colSpan ?? 1}`,
                'grid-row': `${row + 1} / span ${merge?.rowSpan ?? 1}`,
                display: 'flex',
                'align-items': 'center',
                padding: `${el.cellPadding}px`,
                'border-right': `1px solid ${el.borderColor}`,
                'border-bottom': `1px solid ${el.borderColor}`,
                'border-top': row === 0 ? `1px solid ${el.borderColor}` : undefined,
                'border-left': col === 0 ? `1px solid ${el.borderColor}` : undefined,
                background: el.headerRow && row === 0 ? el.headerFill : undefined,
                'font-weight': el.headerRow && row === 0 ? 700 : 400,
                overflow: 'hidden',
                'word-break': 'break-word',
              });
              return `<div style="${cellStyle}">${escapeHtml(cell)}</div>`;
            })
            .join(''),
        )
        .join('');
      return `<div class="aps-el aps-table" style="${outer}"><div style="${grid}">${cells}</div></div>`;
    }
    case 'rect': {
      const style = styleString({
        ...boxStyle(el),
        background: el.fill,
        border: el.strokeWidth > 0 ? `${el.strokeWidth}px solid ${el.stroke}` : undefined,
        'border-radius': `${el.radius}px`,
      });
      return `<div class="aps-el aps-rect" style="${style}"></div>`;
    }
    case 'ellipse': {
      const style = styleString({
        ...boxStyle(el),
        background: el.fill,
        border: el.strokeWidth > 0 ? `${el.strokeWidth}px solid ${el.stroke}` : undefined,
        'border-radius': '50%',
      });
      return `<div class="aps-el aps-ellipse" style="${style}"></div>`;
    }
    case 'line': {
      const outer = styleString({
        ...boxStyle(el),
        display: 'flex',
        'align-items': 'center',
      });
      const inner = styleString({
        width: '100%',
        height: `${Math.max(1, el.strokeWidth)}px`,
        background: el.stroke,
        'border-radius': `${Math.max(1, el.strokeWidth) / 2}px`,
      });
      return `<div class="aps-el aps-line" style="${outer}"><div style="${inner}"></div></div>`;
    }
    case 'image': {
      const src = sanitizeImageSrc(el.src);
      const style = styleString({
        ...boxStyle(el),
        overflow: 'hidden',
        'border-radius': `${el.radius}px`,
      });
      if (!src) {
        return `<div class="aps-el aps-image aps-image-empty" style="${style}"></div>`;
      }
      const imgStyle = styleString({
        width: '100%',
        height: '100%',
        'object-fit': el.fit,
        display: 'block',
      });
      return `<div class="aps-el aps-image" style="${style}"><img src="${escapeHtml(src)}" alt="${escapeHtml(el.alt)}" style="${imgStyle}" /></div>`;
    }
    case 'chart': {
      const style = styleString({ ...boxStyle(el), overflow: 'hidden' });
      return `<div class="aps-el aps-chart" style="${style}">${buildChartSvg(el)}</div>`;
    }
    case 'ai_component':
      return renderAiComponent(el);
    default:
      return '';
  }
}

export function sortedElements(elements: SlideElement[]): SlideElement[] {
  return [...elements].sort((a, b) => a.z - b.z);
}
