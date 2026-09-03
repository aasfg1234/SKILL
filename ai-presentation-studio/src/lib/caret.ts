/**
 * contentEditable 的游標位置與純文字位置互換。
 *
 * 直接編輯文字用的是 contentEditable，不是 textarea，
 * 所以「第幾個字」必須自己走 DOM 算出來。
 * 換行在 DOM 裡是 <br>，在純文字裡是一個換行字元，兩邊都算一個字。
 */

export interface CaretPosition {
  node: Node;
  offset: number;
}

function isLineBreak(node: Node): boolean {
  return node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === 'BR';
}

/** node 的第 offset 個位置，換算成 root 裡的第幾個字。找不到時回傳全長。 */
export function textOffsetOf(root: HTMLElement, node: Node, offset: number): number {
  let count = 0;
  let found = -1;

  const visit = (current: Node): void => {
    if (found >= 0) return;

    if (current.nodeType === Node.TEXT_NODE) {
      if (current === node) {
        found = count + Math.min(offset, current.textContent?.length ?? 0);
        return;
      }
      count += current.textContent?.length ?? 0;
      return;
    }

    if (isLineBreak(current)) {
      if (current === node) {
        found = count;
        return;
      }
      count += 1;
      return;
    }

    const children = Array.from(current.childNodes);
    for (let i = 0; i < children.length; i += 1) {
      if (current === node && i === offset) {
        found = count;
        return;
      }
      visit(children[i]);
      if (found >= 0) return;
    }
    if (current === node && offset >= children.length) found = count;
  };

  visit(root);
  return found >= 0 ? found : count;
}

/** root 裡的第 target 個字，換算成游標可以用的位置。 */
export function positionAt(root: HTMLElement, target: number): CaretPosition {
  let count = 0;
  let result: CaretPosition | null = null;
  let last: CaretPosition = { node: root, offset: 0 };

  const visit = (current: Node): void => {
    if (result) return;

    if (current.nodeType === Node.TEXT_NODE) {
      const length = current.textContent?.length ?? 0;
      last = { node: current, offset: length };
      if (count + length >= target) {
        result = { node: current, offset: Math.max(0, target - count) };
        return;
      }
      count += length;
      return;
    }

    if (isLineBreak(current)) {
      count += 1;
      return;
    }

    for (const child of Array.from(current.childNodes)) {
      visit(child);
      if (result) return;
    }
  };

  visit(root);
  return result ?? last;
}

/** 讀出目前選取範圍在 root 裡的純文字位置。 */
export function readCaret(root: HTMLElement): { start: number; end: number } | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;

  return {
    start: textOffsetOf(root, range.startContainer, range.startOffset),
    end: textOffsetOf(root, range.endContainer, range.endOffset),
  };
}

/** 把游標放到 root 裡的第 start 到第 end 個字之間。 */
export function writeCaret(root: HTMLElement, start: number, end: number): void {
  const selection = window.getSelection();
  if (!selection) return;

  const from = positionAt(root, start);
  const to = positionAt(root, end);
  const range = document.createRange();
  range.setStart(from.node, from.offset);
  range.setEnd(to.node, to.offset);
  selection.removeAllRanges();
  selection.addRange(range);
}
