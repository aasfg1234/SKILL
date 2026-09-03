import { slideNumberFor } from '../model/deck';
import type { Presentation } from '../model/types';

/**
 * 投影片右下角的自動頁碼。
 *
 * 畫布、縮圖、播放與匯出四邊都用同一份計算，數字才不會四種地方不一樣。
 */
export function SlideNumber({
  presentation,
  index,
}: {
  presentation: Presentation;
  index: number;
}) {
  const box = slideNumberFor(presentation, index);
  if (!box) return null;

  return (
    <div
      style={{
        position: 'absolute',
        right: box.right,
        bottom: box.bottom,
        fontSize: box.fontSize,
        color: box.color,
        fontFamily: box.fontFamily,
        pointerEvents: 'none',
      }}
    >
      {box.text}
    </div>
  );
}
