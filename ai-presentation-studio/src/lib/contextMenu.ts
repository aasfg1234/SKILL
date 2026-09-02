/**
 * 右鍵選單的內容。
 *
 * 這裡只決定「該出現哪些項目」，不碰畫面也不碰 store，
 * 所以可以用單元測試把行為鎖住。
 */

export interface ContextMenuItem {
  id: string;
  label?: string;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
}

export interface ContextMenuContext {
  /** 目前有沒有選到元件 */
  hasSelection: boolean;
  /** 選到幾個元件 */
  selectedCount: number;
  /** 剪貼簿裡有沒有東西 */
  canPaste: boolean;
  /** 選取範圍裡有沒有已經成組的元件 */
  canUngroup: boolean;
  /** 選取範圍裡有沒有鎖定的元件 */
  locked: boolean;
  /** 這一頁有沒有任何元件 */
  hasElements: boolean;
}

export function buildContextMenu(ctx: ContextMenuContext): ContextMenuItem[] {
  if (!ctx.hasSelection) {
    const items: ContextMenuItem[] = [];
    if (ctx.canPaste) items.push({ id: 'paste', label: '貼上', shortcut: 'Ctrl+V' });
    items.push({
      id: 'select-all',
      label: '全選本頁',
      shortcut: 'Ctrl+A',
      disabled: !ctx.hasElements,
    });
    return items;
  }

  const items: ContextMenuItem[] = [{ id: 'copy', label: '複製', shortcut: 'Ctrl+C' }];

  if (ctx.canPaste) items.push({ id: 'paste', label: '貼上', shortcut: 'Ctrl+V' });

  items.push({ id: 'duplicate', label: '再製', shortcut: 'Ctrl+D', disabled: ctx.locked });
  items.push({ id: 'sep-order', separator: true });
  items.push({ id: 'bring-front', label: '移至最上', disabled: ctx.locked });
  items.push({ id: 'send-back', label: '移至最下', disabled: ctx.locked });

  if (ctx.selectedCount >= 2 || ctx.canUngroup) {
    items.push({ id: 'sep-group', separator: true });
    if (ctx.selectedCount >= 2) {
      items.push({ id: 'group', label: '建立群組', shortcut: 'Ctrl+G' });
    }
    if (ctx.canUngroup) {
      items.push({ id: 'ungroup', label: '取消群組', shortcut: 'Ctrl+Shift+G' });
    }
  }

  items.push({ id: 'sep-danger', separator: true });
  items.push({ id: 'lock', label: ctx.locked ? '解除鎖定' : '鎖定' });
  items.push({
    id: 'delete',
    label: '刪除',
    shortcut: 'Delete',
    danger: true,
    disabled: ctx.locked,
  });

  return items;
}
