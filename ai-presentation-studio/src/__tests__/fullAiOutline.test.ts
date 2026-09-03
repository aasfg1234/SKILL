import { describe, expect, it } from 'vitest';
import { addOutlineSlide, deleteOutlineSlide, isPresentationOutline, moveOutlineSlide, updateOutlineSlide } from '../ai/outline';
import type { PresentationOutline } from '../ai/types';

function outline(): PresentationOutline {
  return {
    title: '測試', subtitle: '副標題', slides: [
      { id: 'a', title: '甲', summary: '甲摘要', layoutId: 'title', visualSuggestion: '', notesSummary: '', locked: false },
      { id: 'b', title: '乙', summary: '乙摘要', layoutId: 'title-content', visualSuggestion: '', notesSummary: '', locked: false },
      { id: 'c', title: '丙', summary: '丙摘要', layoutId: 'two-column', visualSuggestion: '', notesSummary: '', locked: false },
    ],
  };
}

describe('全 AI 大綱編輯', () => {
  it('拖曳排序會搬動指定頁面', () => expect(moveOutlineSlide(outline().slides, 'c', 'a').map((slide) => slide.id)).toEqual(['c', 'a', 'b']));
  it('可以新增及刪除大綱頁面', () => {
    const added = addOutlineSlide(outline());
    expect(added.slides).toHaveLength(4);
    expect(deleteOutlineSlide(added, added.slides[3].id).slides).toHaveLength(3);
  });
  it('至少會保留一張大綱頁面', () => {
    const one = { ...outline(), slides: [outline().slides[0]] };
    expect(deleteOutlineSlide(one, 'a')).toEqual(one);
  });
  it('鎖定狀態與文字可以更新', () => {
    const next = updateOutlineSlide(outline(), 'b', { locked: true, title: '更新標題' });
    expect(next.slides[1]).toMatchObject({ locked: true, title: '更新標題' });
  });
  it('會拒絕格式錯誤的大綱', () => {
    expect(isPresentationOutline(outline())).toBe(true);
    expect(isPresentationOutline({ title: '缺少頁面' })).toBe(false);
  });
});

