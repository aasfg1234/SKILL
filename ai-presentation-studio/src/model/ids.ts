/** 穩定唯一 ID 產生器：一律不使用 array index 當作識別。 */

const COUNTERS = new Map<string, number>();

function randomChunk(): string {
  const g = globalThis as { crypto?: Crypto };
  if (g.crypto && typeof g.crypto.getRandomValues === 'function') {
    const buf = new Uint8Array(4);
    g.crypto.getRandomValues(buf);
    return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return Math.random().toString(16).slice(2, 10).padStart(8, '0');
}

/** 產生形如 `el-3f9a12cd-7` 的穩定 ID。 */
export function newId(prefix: string): string {
  const n = (COUNTERS.get(prefix) ?? 0) + 1;
  COUNTERS.set(prefix, n);
  return `${prefix}-${randomChunk()}-${n.toString(36)}`;
}

export function newPresentationId(): string {
  return newId('pres');
}

export function newSlideId(): string {
  return newId('slide');
}

export function newElementId(kind: string): string {
  return newId(`el-${kind}`);
}

export function newGroupId(): string {
  return newId('group');
}

/** AI Task 使用人類可讀的序號格式 TASK-001，並確保不與既有 ID 衝突。 */
export function nextTaskId(existing: Iterable<string>): string {
  let max = 0;
  for (const id of existing) {
    const m = /^TASK-(\d+)$/.exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `TASK-${String(max + 1).padStart(3, '0')}`;
}

/** 確保 ID 在集合中唯一，重複時加上後綴。 */
export function ensureUnique(id: string, taken: Set<string>): string {
  if (!taken.has(id)) return id;
  let i = 2;
  while (taken.has(`${id}-${i}`)) i += 1;
  return `${id}-${i}`;
}
