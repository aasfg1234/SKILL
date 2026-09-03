import { describe, expect, it } from 'vitest';
import { positionAt, textOffsetOf } from '../lib/caret';

function build(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  return root;
}

describe('把游標位置換算成純文字的第幾個字', () => {
  it('單純一段文字就是字數', () => {
    const root = build('abcdef');

    expect(textOffsetOf(root, root.firstChild as Node, 2)).toBe(2);
  });

  it('換行符號本身也算一個字', () => {
    const root = build('abc<br>def');
    const second = root.childNodes[2];

    expect(textOffsetOf(root, second, 1)).toBe(5);
  });

  it('連續兩個換行之間的空行也算得出來', () => {
    const root = build('abc<br><br>def');
    const third = root.childNodes[3];

    expect(textOffsetOf(root, third, 0)).toBe(5);
  });

  it('游標停在元素本身時，用子節點的位置換算', () => {
    const root = build('abc<br>def');

    expect(textOffsetOf(root, root, 2)).toBe(4);
  });

  it('找不到節點時回傳整段文字的長度，不會壞掉', () => {
    const root = build('abc');
    const outside = document.createElement('span');

    expect(textOffsetOf(root, outside, 0)).toBe(3);
  });
});

describe('把第幾個字換算回游標位置', () => {
  it('落在第一段文字裡', () => {
    const root = build('abc<br>def');

    expect(positionAt(root, 2)).toEqual({ node: root.firstChild, offset: 2 });
  });

  it('落在換行後面的那一段', () => {
    const root = build('abc<br>def');

    expect(positionAt(root, 5)).toEqual({ node: root.childNodes[2], offset: 1 });
  });

  it('剛好停在換行前面時，留在前一段的結尾', () => {
    const root = build('abc<br>def');

    expect(positionAt(root, 3)).toEqual({ node: root.firstChild, offset: 3 });
  });

  it('超過總長度時停在最後', () => {
    const root = build('abc');

    expect(positionAt(root, 99)).toEqual({ node: root.firstChild, offset: 3 });
  });

  it('完全沒有內容時回傳根節點', () => {
    const root = build('');

    expect(positionAt(root, 0)).toEqual({ node: root, offset: 0 });
  });
});
