/** 投影片列表的多選規則。 */

export type SlideSelectMode = 'replace' | 'toggle' | 'range';

/**
 * 算出點選之後的選取結果。
 *
 * - replace：一般點選，只留下這一張
 * - toggle：Ctrl／⌘ 點選，加選或退選；不會把選取清空
 * - range：Shift 點選，從上一次點的那張連選到這一張
 *
 * 回傳的順序一律依照投影片本身的順序，方便後續批次操作。
 */
export function resolveSlideSelection(
  allIds: string[],
  current: string[],
  target: string,
  mode: SlideSelectMode,
): string[] {
  const order = (ids: string[]) => allIds.filter((id) => ids.includes(id));

  if (mode === 'replace') return [target];

  if (mode === 'toggle') {
    if (current.includes(target)) {
      const next = current.filter((id) => id !== target);
      return next.length > 0 ? order(next) : [target];
    }
    return order([...current, target]);
  }

  const anchor = current[current.length - 1];
  if (!anchor) return [target];
  const from = allIds.indexOf(anchor);
  const to = allIds.indexOf(target);
  if (from < 0 || to < 0) return [target];
  return allIds.slice(Math.min(from, to), Math.max(from, to) + 1);
}
