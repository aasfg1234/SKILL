/**
 * 字型清單。
 *
 * 核心規則：**每一組字型堆疊都以拉丁字型開頭。**
 *
 * 中文字在各家字型裡都是等寬的，換字型不會影響寬度。
 * 真正讓版面跑掉的是英文字母、數字與百分比符號。
 * 只要把英文固定成各系統都有、而且尺寸一致的字型（Arial / Times New Roman /
 * Courier New），整行文字的寬度就會固定，換一台電腦開也不會跑版。
 *
 * 已知極限：Android 沒有這幾個字型，會換成尺寸不同的替代品。
 * 要連 Android 都完全一致，只能把字型檔內嵌進簡報。
 */

export interface FontChoice {
  id: string;
  /** 給使用者看的名稱 */
  label: string;
  /** 給使用者看的補充說明 */
  hint: string;
  /** CSS font-family，一律拉丁字型在前、中文字型在後、通用字族收尾 */
  stack: string;
}

/** 允許放在第一位的拉丁字型：Windows 與 macOS 都有，尺寸一致。 */
export const LATIN_FIRST_FAMILIES = ['Arial', 'Times New Roman', 'Courier New'];

export const FONT_CHOICES: FontChoice[] = [
  {
    id: 'sans',
    label: '黑體',
    hint: '簡報預設，字面清楚',
    stack: 'Arial,"Microsoft JhengHei","PingFang TC","Noto Sans TC",sans-serif',
  },
  {
    id: 'serif',
    label: '明體',
    hint: '偏正式的印刷感',
    stack: '"Times New Roman","PMingLiU","Songti TC","Noto Serif TC",serif',
  },
  {
    id: 'kai',
    label: '楷體',
    hint: '偏手寫的公文感',
    stack: '"Times New Roman","DFKai-SB","Kaiti TC","BiauKai",serif',
  },
  {
    id: 'mono',
    label: '等寬',
    hint: '適合程式碼與數字對齊',
    stack: '"Courier New",Consolas,"Microsoft JhengHei",monospace',
  },
];

export const DEFAULT_FONT_ID = 'sans';

/**
 * 舊版本用過的字型堆疊。
 *
 * 這些都把中文字型排在最前面，英文也交給中文字型畫，因此換系統會跑版。
 * 讀到這些值時一律換成新的拉丁優先版本。
 */
export const LEGACY_FONT_STACKS = [
  '"Noto Sans TC","PingFang TC","Microsoft JhengHei","微軟正黑體",-apple-system,"Segoe UI",sans-serif',
  "'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', '微軟正黑體', -apple-system, 'Segoe UI', sans-serif",
];

/** 把字型堆疊正規化，方便比對：去掉引號與多餘空白。 */
function normalize(stack: string): string {
  return stack
    .split(',')
    .map((part) => part.trim().replace(/^["']|["']$/g, ''))
    .join(',');
}

/** 依代號取得字型堆疊；認不得的代號一律給預設字型。 */
export function fontStackOf(id: string | undefined): string {
  const choice = FONT_CHOICES.find((item) => item.id === id);
  return (choice ?? FONT_CHOICES.find((item) => item.id === DEFAULT_FONT_ID)!).stack;
}

/** 由字型堆疊反查代號，讓下拉選單知道目前選的是哪一個。 */
export function fontIdOfStack(stack: string | undefined): string {
  if (!stack) return DEFAULT_FONT_ID;
  const target = normalize(stack);
  const hit = FONT_CHOICES.find((item) => normalize(item.stack) === target);
  if (hit) return hit.id;
  if (LEGACY_FONT_STACKS.some((legacy) => normalize(legacy) === target)) return DEFAULT_FONT_ID;
  return DEFAULT_FONT_ID;
}

/**
 * 舊存檔的字型升級。
 *
 * 只換掉本專案自己用過的舊堆疊，使用者自己設定的字型不動。
 */
export function migrateFontStack(stack: string | undefined): string | undefined {
  if (!stack) return stack;
  const target = normalize(stack);
  return LEGACY_FONT_STACKS.some((legacy) => normalize(legacy) === target)
    ? fontStackOf(DEFAULT_FONT_ID)
    : stack;
}
