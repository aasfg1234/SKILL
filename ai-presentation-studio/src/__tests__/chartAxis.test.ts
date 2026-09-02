import { describe, expect, it } from 'vitest';
import {
  axisRange,
  categoryLabelPlan,
  estimateTextWidth,
  formatAxisValue,
  parsePastedSeries,
} from '../model/chart';

describe('座標軸範圍', () => {
  it('全部是正數時從 0 開始，刻度取好看的數字', () => {
    expect(axisRange([10, 25, 15])).toMatchObject({ min: 0, max: 30, step: 10 });
    expect(axisRange([10, 25, 15]).ticks).toEqual([0, 10, 20, 30]);
  });

  it('小數也給得出合理的刻度，不會全部擠在下面', () => {
    const range = axisRange([0.3, 1.2, 2.4, 3.6]);

    expect(range.min).toBe(0);
    expect(range.max).toBe(4);
    expect(range.ticks).toEqual([0, 1, 2, 3, 4]);
  });

  it('很大的數字也不會爆掉', () => {
    const range = axisRange([1250000]);

    expect(range.max).toBe(1500000);
    expect(range.ticks).toEqual([0, 500000, 1000000, 1500000]);
  });

  it('有負數時軸會往下延伸，而且一定包含 0', () => {
    const range = axisRange([-50, 80]);

    expect(range.min).toBe(-50);
    expect(range.max).toBe(100);
    expect(range.ticks).toContain(0);
    expect(range.ticks[0]).toBe(-50);
  });

  it('全部是 0 時給 0 到 1，不會除以零', () => {
    expect(axisRange([0, 0, 0])).toMatchObject({ min: 0, max: 1 });
  });

  it('沒有資料時也不會壞掉', () => {
    expect(axisRange([]).max).toBeGreaterThan(0);
  });
});

describe('座標軸數字的寫法', () => {
  it('大數字加千分位', () => {
    expect(formatAxisValue(1500000)).toBe('1,500,000');
    expect(formatAxisValue(2500)).toBe('2,500');
  });

  it('小數保留必要的位數', () => {
    expect(formatAxisValue(0.5)).toBe('0.5');
    expect(formatAxisValue(2)).toBe('2');
  });

  it('負數保留負號', () => {
    expect(formatAxisValue(-50)).toBe('-50');
  });
});

describe('文字寬度估算', () => {
  it('英數字約佔 0.6 個字寬，中文約佔 1 個', () => {
    expect(estimateTextWidth('123', 10)).toBe(18);
    expect(estimateTextWidth('中文', 10)).toBe(20);
  });

  it('空字串是 0', () => {
    expect(estimateTextWidth('', 20)).toBe(0);
  });
});

describe('類別標籤的排法', () => {
  it('放得下就照原樣', () => {
    expect(categoryLabelPlan(['Q1', 'Q2'], 200, 24)).toEqual({ fontSize: 24, rotate: 0 });
  });

  it('放不下先縮小字級', () => {
    const plan = categoryLabelPlan(['一二三四', '五六七八'], 60, 24);

    expect(plan.fontSize).toBeLessThan(24);
    expect(plan.fontSize).toBeGreaterThanOrEqual(Math.round(24 * 0.6));
  });

  it('縮到最小還是放不下就轉角度', () => {
    const plan = categoryLabelPlan(['生成式 AI 應用', '資料治理平台'], 60, 24);

    expect(plan.rotate).toBe(-35);
  });

  it('沒有標籤時不會壞掉', () => {
    expect(categoryLabelPlan([], 100, 24)).toEqual({ fontSize: 24, rotate: 0 });
  });
});

describe('從試算表貼上資料', () => {
  it('看得懂用 Tab 分隔的兩欄', () => {
    expect(parsePastedSeries('一月\t100\n二月\t200')).toEqual({
      labels: ['一月', '二月'],
      series: [{ name: '', values: [100, 200] }],
    });
  });

  it('看得懂用逗號分隔的兩欄', () => {
    expect(parsePastedSeries('一月,100\n二月,200')).toEqual({
      labels: ['一月', '二月'],
      series: [{ name: '', values: [100, 200] }],
    });
  });

  it('數字裡的千分位逗號不會被誤判', () => {
    expect(parsePastedSeries('一月\t1,200\n二月\t2,450')?.series[0].values).toEqual([1200, 2450]);
  });

  it('第一列是標題時自動跳過', () => {
    expect(parsePastedSeries('月份\t營收\n一月\t100')).toEqual({
      labels: ['一月'],
      series: [{ name: '營收', values: [100] }],
    });
  });

  it('空行會被忽略', () => {
    expect(parsePastedSeries('\n一月\t100\n\n二月\t200\n')?.labels).toEqual(['一月', '二月']);
  });

  it('只有一欄時當成名稱，數值補零', () => {
    expect(parsePastedSeries('一月\n二月')).toEqual({
      labels: ['一月', '二月'],
      series: [{ name: '', values: [0, 0] }],
    });
  });

  it('完全看不懂的內容回傳 null', () => {
    expect(parsePastedSeries('   ')).toBeNull();
    expect(parsePastedSeries('')).toBeNull();
  });
});
