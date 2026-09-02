import { describe, expect, it } from 'vitest';
import { buildContextMenu } from '../lib/contextMenu';

function ids(items: ReturnType<typeof buildContextMenu>): string[] {
  return items.filter((item) => !item.separator).map((item) => item.id);
}

describe('右鍵選單內容', () => {
  it('在空白處按右鍵只提供貼上與全選', () => {
    const items = buildContextMenu({
      hasSelection: false,
      selectedCount: 0,
      canPaste: true,
      canUngroup: false,
      locked: false,
      hasElements: true,
    });

    expect(ids(items)).toEqual(['paste', 'select-all']);
  });

  it('選到一個元件時提供複製、再製、層級、鎖定與刪除', () => {
    const items = buildContextMenu({
      hasSelection: true,
      selectedCount: 1,
      canPaste: false,
      canUngroup: false,
      locked: false,
      hasElements: true,
    });

    expect(ids(items)).toEqual([
      'copy',
      'duplicate',
      'bring-front',
      'send-back',
      'lock',
      'delete',
    ]);
  });

  it('選到兩個以上才出現建立群組', () => {
    const one = buildContextMenu({
      hasSelection: true,
      selectedCount: 1,
      canPaste: false,
      canUngroup: false,
      locked: false,
      hasElements: true,
    });
    const many = buildContextMenu({
      hasSelection: true,
      selectedCount: 3,
      canPaste: false,
      canUngroup: false,
      locked: false,
      hasElements: true,
    });

    expect(ids(one)).not.toContain('group');
    expect(ids(many)).toContain('group');
  });

  it('已經是群組時才出現取消群組', () => {
    const items = buildContextMenu({
      hasSelection: true,
      selectedCount: 2,
      canPaste: false,
      canUngroup: true,
      locked: false,
      hasElements: true,
    });

    expect(ids(items)).toContain('ungroup');
  });

  it('鎖定的元件顯示解除鎖定，且不能刪除', () => {
    const items = buildContextMenu({
      hasSelection: true,
      selectedCount: 1,
      canPaste: false,
      canUngroup: false,
      locked: true,
      hasElements: true,
    });

    expect(items.find((item) => item.id === 'lock')?.label).toBe('解除鎖定');
    expect(items.find((item) => item.id === 'delete')?.disabled).toBe(true);
  });
});
