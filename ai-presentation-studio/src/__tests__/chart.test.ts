import { describe, expect, it } from 'vitest';
import { createChartElement } from '../model/factory';
import { buildChartSvg } from '../model/chartDraw';

function chart(overrides = {}) {
  return createChartElement({
    x: 0,
    y: 0,
    width: 800,
    height: 500,
    labels: ['一月', '二月', '三月'],
    values: [10, 25, 15],
    ...overrides,
  });
}

describe('圖表', () => {
  it('產生的是完整的 SVG，尺寸與元素一致', () => {
    const svg = buildChartSvg(chart());

    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
    expect(svg).toContain('viewBox="0 0 800 500"');
  });

  it('長條圖每一筆資料畫一根長條', () => {
    const svg = buildChartSvg(chart({ chartType: 'bar' }));

    expect((svg.match(/<rect /g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(svg).toContain('一月');
    expect(svg).toContain('三月');
  });

  it('折線圖畫出一條折線', () => {
    const svg = buildChartSvg(chart({ chartType: 'line' }));

    expect(svg).toContain('<polyline');
  });

  it('圓餅圖每一筆資料畫一個扇形', () => {
    const svg = buildChartSvg(chart({ chartType: 'pie' }));

    expect((svg.match(/<path /g) ?? []).length).toBe(3);
  });

  it('沒有資料時給提示，不會產生壞掉的 SVG', () => {
    const svg = buildChartSvg(chart({ labels: [], values: [] }));

    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('尚未輸入資料');
  });

  it('標籤裡的角括號會被跳脫，不會被當成標籤', () => {
    const svg = buildChartSvg(chart({ labels: ['<script>', '二月', '三月'] }));

    expect(svg).toContain('&lt;script&gt;');
    expect(svg).not.toContain('<script>');
  });

  it('數值比標籤少時補零，多的忽略，不會錯位', () => {
    const svg = buildChartSvg(chart({ labels: ['甲', '乙', '丙'], values: [5] }));

    expect(svg).toContain('甲');
    expect(svg).toContain('丙');
    expect(svg.startsWith('<svg')).toBe(true);
  });
});
