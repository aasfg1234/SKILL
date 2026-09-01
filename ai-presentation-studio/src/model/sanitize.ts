/**
 * 匯入內容的安全處理。
 *
 * 外部 AI 產生的 SVG / HTML 會被直接嵌入編輯器與匯出的簡報，
 * 因此必須先移除可執行內容。第一版採用保守的白名單策略：
 * 只保留繪圖與排版需要的標籤與屬性，其餘一律丟棄。
 */

const ALLOWED_SVG_TAGS = new Set([
  'svg', 'g', 'defs', 'symbol', 'use', 'title', 'desc', 'style',
  'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
  'text', 'tspan', 'textPath',
  'linearGradient', 'radialGradient', 'stop', 'pattern', 'clipPath', 'mask',
  'marker', 'filter', 'feGaussianBlur', 'feOffset', 'feBlend', 'feColorMatrix',
  'feMerge', 'feMergeNode', 'feDropShadow',
]);

const ALLOWED_HTML_TAGS = new Set([
  'div', 'span', 'p', 'br', 'hr', 'strong', 'em', 'b', 'i', 'u', 's', 'small',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
  'figure', 'figcaption', 'blockquote', 'code', 'pre', 'section', 'article', 'header', 'footer',
  ...ALLOWED_SVG_TAGS,
]);

const BLOCKED_TAGS_WITH_CONTENT = [
  'script', 'iframe', 'object', 'embed', 'applet', 'link', 'meta', 'base',
  'form', 'input', 'button', 'textarea', 'select', 'audio', 'video', 'source',
  'animate', 'animateTransform', 'set', 'foreignObject',
];

const URL_ATTRS = new Set(['href', 'xlink:href', 'src', 'xlink:show', 'from', 'to']);

export interface SanitizeResult {
  content: string;
  removed: string[];
}

function stripBlockedTags(input: string, removed: string[]): string {
  let out = input;
  for (const tag of BLOCKED_TAGS_WITH_CONTENT) {
    const paired = new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}\\s*>`, 'gi');
    const self = new RegExp(`<${tag}\\b[^>]*\\/?>`, 'gi');
    out = out.replace(paired, () => {
      removed.push(`<${tag}>`);
      return '';
    });
    out = out.replace(self, () => {
      removed.push(`<${tag}>`);
      return '';
    });
  }
  // 移除 HTML 註解，避免藏匿條件式註解攻擊
  out = out.replace(/<!--[\s\S]*?-->/g, '');
  return out;
}

/** 移除空白與控制字元，避免 `java\nscript:` 之類的繞過手法。 */
function stripControlChars(value: string): string {
  let out = '';
  for (const ch of value) {
    if (ch.charCodeAt(0) > 32) out += ch;
  }
  return out;
}

function isDangerousUrl(value: string): boolean {
  const decoded = value
    .replace(/&#(\d+);?/g, (_m, d: string) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);?/gi, (_m, h: string) => String.fromCharCode(parseInt(h, 16)));
  const normalized = stripControlChars(decoded).toLowerCase();
  return (
    normalized.startsWith('javascript:') ||
    normalized.startsWith('vbscript:') ||
    normalized.startsWith('data:text/html')
  );
}

function sanitizeAttributes(attrText: string, removed: string[]): string {
  const attrRe = /([:\w-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  const kept: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(attrText)) !== null) {
    const rawName = m[1];
    const name = rawName.toLowerCase();
    const value = m[3] ?? m[4] ?? m[5] ?? '';
    if (name.startsWith('on')) {
      removed.push(`${rawName}=`);
      continue;
    }
    if (name === 'style' && /expression\s*\(|javascript:|behaviou?r\s*:|@import/i.test(value)) {
      removed.push('style');
      continue;
    }
    if (URL_ATTRS.has(name) && isDangerousUrl(value)) {
      removed.push(`${rawName}(url)`);
      continue;
    }
    if (name === 'srcdoc') {
      removed.push('srcdoc');
      continue;
    }
    kept.push(`${rawName}="${value.replace(/"/g, '&quot;')}"`);
  }
  return kept.length ? ` ${kept.join(' ')}` : '';
}

/**
 * 沒有子節點的元素。
 *
 * HTML 解析器不認得 SVG 的空元素，`<rect>` 少了結尾斜線就會把後面的節點
 * 全部吃成它的子節點，整張圖等於毀掉。因此這些標籤一律補上自封閉斜線。
 */
const SELF_CLOSING_TAGS = new Set([
  'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path',
  'stop', 'use', 'image', 'br', 'hr', 'col', 'feoffset', 'femergenode',
  'fegaussianblur', 'feblend', 'fecolormatrix', 'fedropshadow',
]);

function sanitizeTags(input: string, allowed: Set<string>, removed: string[]): string {
  return input.replace(
    /<\s*(\/?)\s*([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)\s*(\/?)\s*>/g,
    (_full, closing: string, tagName: string, attrs: string, selfClose: string) => {
      const lower = tagName.toLowerCase();
      let canonical: string | undefined;
      for (const t of allowed) {
        if (t.toLowerCase() === lower) {
          canonical = t;
          break;
        }
      }
      if (!canonical) {
        removed.push(`<${tagName}>`);
        return '';
      }
      if (closing) return `</${canonical}>`;
      const empty = Boolean(selfClose) || SELF_CLOSING_TAGS.has(lower);
      return `<${canonical}${sanitizeAttributes(attrs, removed)}${empty ? ' /' : ''}>`;
    },
  );
}

/** 移除空元素多餘的結束標籤，例如 `<rect />...</rect>`。 */
function dropRedundantClosingTags(input: string): string {
  return input.replace(/<\/\s*([a-zA-Z][\w:-]*)\s*>/g, (full, tagName: string) =>
    SELF_CLOSING_TAGS.has(tagName.toLowerCase()) ? '' : full,
  );
}

/** 清理外部 AI 產生的 SVG，回傳安全字串與被移除項目清單。 */
export function sanitizeSvg(input: string): SanitizeResult {
  const removed: string[] = [];
  let out = stripBlockedTags(String(input ?? ''), removed);
  out = dropRedundantClosingTags(sanitizeTags(out, ALLOWED_SVG_TAGS, removed));
  return { content: out.trim(), removed: [...new Set(removed)] };
}

/** 清理外部 AI 產生的 HTML 片段。 */
export function sanitizeHtml(input: string): SanitizeResult {
  const removed: string[] = [];
  let out = stripBlockedTags(String(input ?? ''), removed);
  out = dropRedundantClosingTags(sanitizeTags(out, ALLOWED_HTML_TAGS, removed));
  return { content: out.trim(), removed: [...new Set(removed)] };
}

/** 純文字輸出的跳脫，供 renderer 使用。 */
export function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 影像來源只允許 data: 圖片與 http(s)。 */
export function sanitizeImageSrc(src: string): string {
  const value = String(src ?? '').trim();
  if (!value) return '';
  if (/^data:image\/(png|jpe?g|gif|webp|svg\+xml);/i.test(value)) return value;
  if (/^https?:\/\//i.test(value)) return value;
  if (/^\.{0,2}\//.test(value) && !isDangerousUrl(value)) return value;
  return '';
}

/** 依輸出格式挑選對應的清理器。 */
export function sanitizeAiOutput(format: string, content: string): SanitizeResult {
  switch (format) {
    case 'svg':
      return sanitizeSvg(content);
    case 'html':
      return sanitizeHtml(content);
    case 'image': {
      const src = sanitizeImageSrc(content);
      return { content: src, removed: src ? [] : ['不安全的圖片來源'] };
    }
    case 'json':
    case 'text':
    default:
      return { content: String(content ?? ''), removed: [] };
  }
}
