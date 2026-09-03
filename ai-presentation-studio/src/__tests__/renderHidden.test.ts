import { describe, expect, it } from 'vitest';
import { createPresentation, createSlide } from '../model/factory';
import { renderPresentationToHtml } from '../renderer/renderHtml';

function deckOf() {
  const p = createPresentation({
    slides: [
      createSlide({ id: 's1', title: '第一張', masterKind: 'cover' }),
      createSlide({ id: 's2', title: '第二張', masterKind: 'content' }),
      createSlide({ id: 's3', title: '第三張', masterKind: 'content' }),
    ],
  });
  return p;
}

describe('匯出 HTML：隱藏的投影片', () => {
  it('被隱藏的投影片不會出現在匯出檔裡', () => {
    const p = deckOf();
    p.slides[1].hidden = true;

    const html = renderPresentationToHtml(p);

    expect(html).toContain('aps-slide-s1');
    expect(html).not.toContain('aps-slide-s2');
    expect(html).toContain('aps-slide-s3');
  });

  it('總頁數只算沒有被隱藏的投影片', () => {
    const p = deckOf();
    p.slides[1].hidden = true;

    const html = renderPresentationToHtml(p);

    expect(html).toContain('第 1 / 2 頁');
  });

  it('剩下的投影片會重新編號，中間不會空一個號碼', () => {
    const p = deckOf();
    p.slides[1].hidden = true;

    const html = renderPresentationToHtml(p);

    expect(html).toContain('id="aps-slide-s3" data-index="2"');
  });
});

describe('匯出 HTML：自動頁碼', () => {
  it('沒有打開設定時不會出現頁碼', () => {
    const html = renderPresentationToHtml(deckOf());

    expect(html).not.toContain('aps-page-number');
  });

  it('打開之後每一頁右下角都有頁碼', () => {
    const p = deckOf();
    p.settings.showSlideNumbers = true;

    const html = renderPresentationToHtml(p);

    expect(html.match(/aps-page-number/g)).toHaveLength(3);
  });

  it('封面不顯示頁碼時，第二張仍然是 2', () => {
    const p = deckOf();
    p.settings.showSlideNumbers = true;
    p.settings.hideNumberOnCover = true;

    const html = renderPresentationToHtml(p);

    expect(html.match(/aps-page-number/g)).toHaveLength(2);
    expect(html).toContain('>2</div>');
  });
});
