import { describe, expect, it } from 'vitest';
import { createChartElement } from '../model/factory';
import { buildChartSvg } from '../model/chartDraw';
import {
  CHART_TYPES,
  insertSeriesRow,
  moveSeriesRow,
  parsePastedSeries,
  seriesOf,
  sortSeriesRows,
} from '../model/chart';

describe('多數列與舊資料相容', () => {
  it('沒有 series 的舊圖表，讀成一組數列', () => {
    const legacy = { ...createChartElement({}), series: undefined, values: [1, 2, 3] } as never;

    expect(seriesOf(legacy)).toEqual([{ name: '', values: [1, 2, 3] }]);
  });

  it('連 values 都沒有也不會壞掉', () => {
    const broken = { ...createChartElement({}), series: undefined, values: undefined } as never;

    expect(seriesOf(broken)).toEqual([{ name: '', values: [] }]);
  });

  it('新建的圖表就有 series', () => {
    const el = createChartElement({ labels: ['甲', '乙'], series: [{ name: '營收', values: [1, 2] }] });

    expect(seriesOf(el)).toEqual([{ name: '營收', values: [1, 2] }]);
  });

  it('多組數列時，長條圖每一類會畫出多根長條', () => {
    const el = createChartElement({
      width: 900,
      height: 500,
      labels: ['甲', '乙'],
      series: [
        { name: '今年', values: [10, 20] },
        { name: '去年', values: [8, 16] },
      ],
    });

    expect((buildChartSvg(el).match(/<rect /g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it('多組數列時，折線圖每一組畫一條線', () => {
    const el = createChartElement({
      chartType: 'line',
      labels: ['甲', '乙'],
      series: [
        { name: '今年', values: [10, 20] },
        { name: '去年', values: [8, 16] },
      ],
    });

    expect((buildChartSvg(el).match(/<polyline /g) ?? []).length).toBe(2);
  });

  it('圓餅圖只看第一組數列', () => {
    const el = createChartElement({
      chartType: 'pie',
      labels: ['甲', '乙', '丙'],
      series: [
        { name: '今年', values: [10, 20, 30] },
        { name: '去年', values: [1, 1, 1] },
      ],
    });

    expect((buildChartSvg(el).match(/<path /g) ?? []).length).toBe(3);
  });
});

describe('橫向長條圖', () => {
  it('圖表類型多了橫向長條', () => {
    expect(CHART_TYPES.map((t) => t.id)).toEqual(['bar', 'hbar', 'line', 'pie']);
  });

  it('橫向長條圖畫得出長條與類別名稱', () => {
    const svg = buildChartSvg(
      createChartElement({
        chartType: 'hbar',
        labels: ['生成式 AI 應用', '資料治理平台'],
        series: [{ name: '', values: [30, 70] }],
      }),
    );

    expect((svg.match(/<rect /g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(svg).toContain('生成式 AI 應用');
  });

  it('橫向長條圖的類別名稱靠右對齊，不會被縮成看不懂', () => {
    const svg = buildChartSvg(
      createChartElement({
        chartType: 'hbar',
        labels: ['生成式 AI 應用'],
        series: [{ name: '', values: [30] }],
      }),
    );

    expect(svg).toContain('text-anchor="end"');
    expect(svg).not.toContain('rotate(-35');
  });
});

describe('圖例', () => {
  it('關掉之後圓餅圖不畫圖例', () => {
    const on = buildChartSvg(
      createChartElement({ chartType: 'pie', labels: ['甲', '乙'], showLegend: true }),
    );
    const off = buildChartSvg(
      createChartElement({ chartType: 'pie', labels: ['甲', '乙'], showLegend: false }),
    );

    expect(on).toContain('甲');
    expect(off).not.toContain('甲');
  });

  it('多組數列的長條圖會列出每一組的名稱', () => {
    const svg = buildChartSvg(
      createChartElement({
        labels: ['甲'],
        showLegend: true,
        series: [
          { name: '今年', values: [1] },
          { name: '去年', values: [2] },
        ],
      }),
    );

    expect(svg).toContain('今年');
    expect(svg).toContain('去年');
  });
});

describe('資料列的排序與搬移', () => {
  const labels = ['甲', '乙', '丙'];
  const series = [{ name: '數量', values: [30, 10, 20] }];

  it('由大到小排序，數列跟著一起搬', () => {
    const next = sortSeriesRows(labels, series, 'desc');

    expect(next.labels).toEqual(['甲', '丙', '乙']);
    expect(next.series[0].values).toEqual([30, 20, 10]);
  });

  it('由小到大排序', () => {
    expect(sortSeriesRows(labels, series, 'asc').labels).toEqual(['乙', '丙', '甲']);
  });

  it('多組數列排序時，全部一起搬，不會錯位', () => {
    const two = [
      { name: 'A', values: [30, 10, 20] },
      { name: 'B', values: [1, 2, 3] },
    ];
    const next = sortSeriesRows(labels, two, 'desc');

    expect(next.labels).toEqual(['甲', '丙', '乙']);
    expect(next.series[1].values).toEqual([1, 3, 2]);
  });

  it('往上搬一列', () => {
    const next = moveSeriesRow(labels, series, 2, -1);

    expect(next.labels).toEqual(['甲', '丙', '乙']);
    expect(next.series[0].values).toEqual([30, 20, 10]);
  });

  it('已經在最上面就不動', () => {
    expect(moveSeriesRow(labels, series, 0, -1).labels).toEqual(labels);
  });

  it('已經在最下面就不動', () => {
    expect(moveSeriesRow(labels, series, 2, 1).labels).toEqual(labels);
  });

  it('在中間插入一列，每一組數列都補零', () => {
    const two = [
      { name: 'A', values: [30, 10, 20] },
      { name: 'B', values: [1, 2, 3] },
    ];
    const next = insertSeriesRow(labels, two, 1);

    expect(next.labels).toEqual(['甲', '', '乙', '丙']);
    expect(next.series[0].values).toEqual([30, 0, 10, 20]);
    expect(next.series[1].values).toEqual([1, 0, 2, 3]);
  });
});

describe('貼上多欄資料', () => {
  it('三欄會變成兩組數列，標題列當成數列名稱', () => {
    const parsed = parsePastedSeries('月份\t今年\t去年\n一月\t100\t80\n二月\t200\t160');

    expect(parsed?.labels).toEqual(['一月', '二月']);
    expect(parsed?.series).toEqual([
      { name: '今年', values: [100, 200] },
      { name: '去年', values: [80, 160] },
    ]);
  });

  it('沒有標題列時，數列名稱留空', () => {
    const parsed = parsePastedSeries('一月\t100\t80\n二月\t200\t160');

    expect(parsed?.series.map((s) => s.name)).toEqual(['', '']);
  });

  it('兩欄仍然只有一組數列', () => {
    expect(parsePastedSeries('一月\t100\n二月\t200')?.series).toEqual([
      { name: '', values: [100, 200] },
    ]);
  });
});
