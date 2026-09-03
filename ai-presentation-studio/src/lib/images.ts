/** 拖放與貼上圖片的共用工具。 */

/** 放進投影片時最多佔多少比例，留點邊界比較好調整。 */
const MAX_SLIDE_RATIO = 0.7;

/** 等比例縮到投影片的七成以內；小圖維持原尺寸，不放大。 */
export function fitImageIntoSlide(
  natural: { width: number; height: number },
  slide: { width: number; height: number },
): { width: number; height: number } {
  const maxWidth = slide.width * MAX_SLIDE_RATIO;
  const maxHeight = slide.height * MAX_SLIDE_RATIO;
  const scale = Math.min(1, maxWidth / natural.width, maxHeight / natural.height);
  return {
    width: Math.round(natural.width * scale),
    height: Math.round(natural.height * scale),
  };
}

/** 從一批檔案裡挑出第一個圖片。 */
export function pickImageFromFiles(files: ArrayLike<File> | File[] | null): File | null {
  if (!files) return null;
  return (
    Array.from(files).find(
      (file) => typeof file?.type === 'string' && file.type.startsWith('image/'),
    ) ?? null
  );
}

interface ClipboardItemLike {
  kind: string;
  type: string;
  getAsFile(): File | null;
}

interface ClipboardLike {
  files?: ArrayLike<File> | null;
  items?: ArrayLike<ClipboardItemLike> | null;
}

/**
 * 從剪貼簿挑出圖片。
 *
 * 截圖之後直接貼上時，有些瀏覽器只把圖片放在 `items` 裡、`files` 是空的，
 * 所以兩邊都要看，使用者才不必先另存新檔。
 */
export function pickImageFromClipboard(data: ClipboardLike | null | undefined): File | null {
  if (!data) return null;

  const fromFiles = pickImageFromFiles(data.files ?? null);
  if (fromFiles) return fromFiles;

  for (const item of Array.from(data.items ?? [])) {
    if (item?.kind !== 'file') continue;
    if (typeof item.type !== 'string' || !item.type.startsWith('image/')) continue;
    const file = item.getAsFile();
    if (file) return file;
  }
  return null;
}

/** 讀成 data URL，讓簡報保持單一檔案、不依賴外部路徑。 */
export function readImageAsDataUrl(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? '') || null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

/** 量出圖片的原始尺寸；讀不到就給一個安全的預設值。 */
export function measureImage(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () =>
      resolve({ width: image.naturalWidth || 640, height: image.naturalHeight || 400 });
    image.onerror = () => resolve({ width: 640, height: 400 });
    image.src = dataUrl;
  });
}
