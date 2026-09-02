import { describe, expect, it } from 'vitest';
import { resolveSlideSelection } from '../lib/slideSelection';

const ALL = ['s1', 's2', 's3', 's4', 's5'];

describe('投影片多選', () => {
  it('一般點選只留下一張', () => {
    expect(resolveSlideSelection(ALL, ['s2', 's3'], 's5', 'replace')).toEqual(['s5']);
  });

  it('Ctrl 點選可以加選', () => {
    expect(resolveSlideSelection(ALL, ['s2'], 's4', 'toggle')).toEqual(['s2', 's4']);
  });

  it('Ctrl 點選已選的會取消選取', () => {
    expect(resolveSlideSelection(ALL, ['s2', 's4'], 's2', 'toggle')).toEqual(['s4']);
  });

  it('不會把選取清空，至少留一張', () => {
    expect(resolveSlideSelection(ALL, ['s3'], 's3', 'toggle')).toEqual(['s3']);
  });

  it('Shift 點選會選取整段，並依投影片順序排列', () => {
    expect(resolveSlideSelection(ALL, ['s4'], 's2', 'range')).toEqual(['s2', 's3', 's4']);
  });

  it('Shift 點選以最後一張已選的為起點', () => {
    expect(resolveSlideSelection(ALL, ['s1', 's2'], 's4', 'range')).toEqual(['s2', 's3', 's4']);
  });
});
