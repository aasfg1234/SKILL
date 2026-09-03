import { describe, expect, it } from 'vitest';
import { createRectElement } from '../model/factory';
import { moveLayer } from '../model/layerList';
import type { SlideElement } from '../model/types';

/** 由下而上：a 在最底層，d 在最上層。 */
function stack() {
  return [
    createRectElement({ id: 'a', z: 1 }),
    createRectElement({ id: 'b', z: 2 }),
    createRectElement({ id: 'c', z: 3 }),
    createRectElement({ id: 'd', z: 4 }),
  ];
}

/** 回傳由上而下的順序，跟圖層面板看到的一樣。 */
function topDown(elements: SlideElement[]) {
  return [...elements].sort((x, y) => y.z - x.z).map((el) => el.id);
}

describe('拖曳圖層調整順序', () => {
  it('把最底層拖到最上面那一項的上方，它就變成最上層', () => {
    const next = moveLayer(stack(), 'a', 'd', 'above');

    expect(topDown(next)).toEqual(['a', 'd', 'c', 'b']);
  });

  it('放在目標的下方就排在它後面', () => {
    const next = moveLayer(stack(), 'd', 'b', 'below');

    expect(topDown(next)).toEqual(['c', 'b', 'd', 'a']);
  });

  it('往下拖也算得對', () => {
    const next = moveLayer(stack(), 'c', 'a', 'below');

    expect(topDown(next)).toEqual(['d', 'b', 'a', 'c']);
  });

  it('拖到自己身上不會改變任何東西', () => {
    const next = moveLayer(stack(), 'b', 'b', 'above');

    expect(topDown(next)).toEqual(['d', 'c', 'b', 'a']);
  });

  it('找不到的 id 不會弄壞順序', () => {
    const next = moveLayer(stack(), 'x', 'b', 'above');

    expect(topDown(next)).toEqual(['d', 'c', 'b', 'a']);
  });

  it('搬完之後 z 會重新編號成 1 到 n，不會留下空號', () => {
    const next = moveLayer(stack(), 'a', 'd', 'above');

    expect([...next].map((el) => el.z).sort((x, y) => x - y)).toEqual([1, 2, 3, 4]);
  });
});
