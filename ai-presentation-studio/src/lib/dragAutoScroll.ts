/**
 * 拖曳時靠近捲動區上下邊緣，要移動多少像素。
 * 回傳負數往上，正數往下，0 代表不用捲動。
 */
export function dragAutoScrollSpeed(
  pointerY: number,
  top: number,
  bottom: number,
  edgeSize = 72,
  maxSpeed = 20,
): number {
  if (bottom <= top || edgeSize <= 0 || maxSpeed <= 0) return 0;

  if (pointerY < top + edgeSize) {
    const strength = Math.min(1, Math.max(0, (top + edgeSize - pointerY) / edgeSize));
    return -Math.max(1, Math.ceil(maxSpeed * strength));
  }

  if (pointerY > bottom - edgeSize) {
    const strength = Math.min(1, Math.max(0, (pointerY - (bottom - edgeSize)) / edgeSize));
    return Math.max(1, Math.ceil(maxSpeed * strength));
  }

  return 0;
}
