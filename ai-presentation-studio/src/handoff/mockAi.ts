import { PATCH_PROTOCOL, type AIComponentElement, type Presentation, type PresentationPatch } from '../model/types';

/**
 * 模擬 AI 完成（Demo 專用）。
 *
 * 這裡沒有連接任何 AI API，也不會發出任何網路請求。
 * 它的唯一用途是產生一份「格式正確的假結果」，
 * 讓使用者可以在沒有外部 AI 的情況下驗證：
 *   等待 AI 處理 → 匯出 → 匯入 → AI 已完成 → 內容出現在正確位置
 * 產出的內容一律標示為模擬資料，不可當成真實 AI 生成結果。
 */

export const MOCK_PRODUCER = 'mock-simulator';
const WATERMARK = '模擬資料 · 非真實 AI 生成';

const PALETTE = ['#4F46E5', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];

function frame(w: number, h: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" font-family="sans-serif">
  <rect x="0" y="0" width="${w}" height="${h}" fill="#FFFFFF" />
  ${body}
  <text x="${w - 16}" y="${h - 14}" text-anchor="end" font-size="16" fill="#9CA3AF">${WATERMARK}</text>
</svg>`;
}

function mockChart(w: number, h: number, title: string): string {
  const data = [
    { label: '2024', value: 58 },
    { label: '2025', value: 76 },
    { label: '2026', value: 100 },
  ];
  const padL = 110;
  const padR = 60;
  const padT = 90;
  const padB = 90;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;
  const barW = Math.min(160, (chartW / data.length) * 0.5);
  const gridLines = [0, 25, 50, 75, 100]
    .map((v) => {
      const y = padT + chartH - (v / 100) * chartH;
      return `<line x1="${padL}" y1="${y}" x2="${padL + chartW}" y2="${y}" stroke="#E5E7EB" stroke-width="1" />
  <text x="${padL - 16}" y="${y + 6}" text-anchor="end" font-size="18" fill="#9CA3AF">${v}</text>`;
    })
    .join('\n  ');

  const bars = data
    .map((d, i) => {
      const slot = chartW / data.length;
      const x = padL + slot * i + (slot - barW) / 2;
      const barH = (d.value / 100) * chartH;
      const y = padT + chartH - barH;
      const color = PALETTE[i % PALETTE.length];
      return `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="10" fill="${color}" />
  <text x="${x + barW / 2}" y="${y - 16}" text-anchor="middle" font-size="26" font-weight="700" fill="#111827">${d.value}</text>
  <text x="${x + barW / 2}" y="${padT + chartH + 42}" text-anchor="middle" font-size="24" fill="#4B5563">${d.label}</text>`;
    })
    .join('\n  ');

  return frame(
    w,
    h,
    `<text x="${padL}" y="52" font-size="30" font-weight="700" fill="#111827">${title}</text>
  ${gridLines}
  <line x1="${padL}" y1="${padT + chartH}" x2="${padL + chartW}" y2="${padT + chartH}" stroke="#9CA3AF" stroke-width="2" />
  ${bars}`,
  );
}

function mockDiagram(w: number, h: number, title: string): string {
  const layers = ['應用層', 'Agent 層', '模型層', '資料層'];
  const boxH = Math.min(96, (h - 140) / layers.length - 20);
  const boxW = Math.min(760, w - 200);
  const startY = 110;
  const body = layers
    .map((label, i) => {
      const y = startY + i * (boxH + 28);
      const color = PALETTE[i % PALETTE.length];
      const arrow =
        i < layers.length - 1
          ? `<line x1="${w / 2}" y1="${y + boxH}" x2="${w / 2}" y2="${y + boxH + 26}" stroke="#9CA3AF" stroke-width="3" />
  <polygon points="${w / 2 - 8},${y + boxH + 20} ${w / 2 + 8},${y + boxH + 20} ${w / 2},${y + boxH + 30}" fill="#9CA3AF" />`
          : '';
      return `<rect x="${(w - boxW) / 2}" y="${y}" width="${boxW}" height="${boxH}" rx="16" fill="${color}1A" stroke="${color}" stroke-width="2" />
  <text x="${w / 2}" y="${y + boxH / 2 + 10}" text-anchor="middle" font-size="30" font-weight="700" fill="#111827">${label}</text>
  ${arrow}`;
    })
    .join('\n  ');

  return frame(
    w,
    h,
    `<text x="60" y="60" font-size="30" font-weight="700" fill="#111827">${title}</text>
  ${body}`,
  );
}

function mockTimeline(w: number, h: number, title: string): string {
  const points = [
    { year: '2024', text: '基礎模型普及' },
    { year: '2025', text: 'Agent 落地應用' },
    { year: '2026', text: '企業全面導入' },
  ];
  const y = h / 2;
  const padX = 140;
  const span = w - padX * 2;
  const body = points
    .map((p, i) => {
      const x = padX + (span / (points.length - 1)) * i;
      const color = PALETTE[i % PALETTE.length];
      return `<circle cx="${x}" cy="${y}" r="18" fill="${color}" />
  <text x="${x}" y="${y - 46}" text-anchor="middle" font-size="34" font-weight="700" fill="#111827">${p.year}</text>
  <text x="${x}" y="${y + 70}" text-anchor="middle" font-size="24" fill="#4B5563">${p.text}</text>`;
    })
    .join('\n  ');

  return frame(
    w,
    h,
    `<text x="60" y="60" font-size="30" font-weight="700" fill="#111827">${title}</text>
  <line x1="${padX}" y1="${y}" x2="${w - padX}" y2="${y}" stroke="#D1D5DB" stroke-width="6" stroke-linecap="round" />
  ${body}`,
  );
}

function mockInfographic(w: number, h: number, title: string): string {
  const cards = [
    { t: '多模態', d: '文字、影像、語音整合' },
    { t: '自主 Agent', d: '可規劃並執行任務' },
    { t: '邊緣推論', d: '本機執行、低延遲' },
    { t: '治理與稽核', d: '可解釋、可追溯' },
  ];
  const cols = 2;
  const gap = 32;
  const padX = 80;
  const padY = 110;
  const cardW = (w - padX * 2 - gap) / cols;
  const cardH = (h - padY - 80 - gap) / 2;
  const body = cards
    .map((c, i) => {
      const x = padX + (i % cols) * (cardW + gap);
      const y = padY + Math.floor(i / cols) * (cardH + gap);
      const color = PALETTE[i % PALETTE.length];
      return `<rect x="${x}" y="${y}" width="${cardW}" height="${cardH}" rx="20" fill="${color}14" stroke="${color}" stroke-width="2" />
  <circle cx="${x + 52}" cy="${y + 56}" r="22" fill="${color}" />
  <text x="${x + 52}" y="${y + 65}" text-anchor="middle" font-size="24" font-weight="700" fill="#FFFFFF">${i + 1}</text>
  <text x="${x + 96}" y="${y + 66}" font-size="32" font-weight="700" fill="#111827">${c.t}</text>
  <text x="${x + 40}" y="${y + 124}" font-size="24" fill="#4B5563">${c.d}</text>`;
    })
    .join('\n  ');

  return frame(
    w,
    h,
    `<text x="${padX}" y="60" font-size="30" font-weight="700" fill="#111827">${title}</text>
  ${body}`,
  );
}

function mockTable(w: number, h: number, title: string): string {
  const rows = [
    ['項目', '2024', '2025', '2026'],
    ['市場規模（億）', '580', '760', '1000'],
    ['導入企業比例', '18%', '37%', '62%'],
    ['平均投資報酬', '1.2x', '1.8x', '2.6x'],
  ];
  const padX = 80;
  const padY = 110;
  const tableW = w - padX * 2;
  const rowH = Math.min(88, (h - padY - 70) / rows.length);
  const colW = tableW / rows[0].length;
  const body = rows
    .map((cols, r) => {
      const y = padY + r * rowH;
      const bg =
        r === 0
          ? `<rect x="${padX}" y="${y}" width="${tableW}" height="${rowH}" fill="#4F46E5" rx="8" />`
          : r % 2 === 0
            ? `<rect x="${padX}" y="${y}" width="${tableW}" height="${rowH}" fill="#F9FAFB" />`
            : '';
      const cells = cols
        .map(
          (c, i) =>
            `<text x="${padX + colW * i + 24}" y="${y + rowH / 2 + 9}" font-size="24" ${
              r === 0 ? 'font-weight="700" fill="#FFFFFF"' : 'fill="#111827"'
            }>${c}</text>`,
        )
        .join('\n  ');
      return `${bg}\n  ${cells}`;
    })
    .join('\n  ');

  return frame(
    w,
    h,
    `<text x="${padX}" y="60" font-size="30" font-weight="700" fill="#111827">${title}</text>
  ${body}`,
  );
}

function mockGeneric(w: number, h: number, title: string): string {
  return frame(
    w,
    h,
    `<rect x="40" y="40" width="${w - 80}" height="${h - 80}" rx="20" fill="#F5F7FA" stroke="#4F46E5" stroke-width="2" stroke-dasharray="10 8" />
  <text x="${w / 2}" y="${h / 2 - 10}" text-anchor="middle" font-size="36" font-weight="700" fill="#111827">${title}</text>
  <text x="${w / 2}" y="${h / 2 + 42}" text-anchor="middle" font-size="24" fill="#6B7280">此區塊由模擬器產生，供流程測試使用</text>`,
  );
}

function shortPrompt(prompt: string, fallback: string): string {
  const text = (prompt || fallback).replace(/\s+/g, ' ').trim();
  return text.length > 28 ? `${text.slice(0, 28)}…` : text;
}

/** 依 AI 元件產生一份模擬結果（SVG 或文字）。 */
export function buildMockOutput(el: AIComponentElement): { type: 'svg' | 'text'; content: string } {
  const w = Math.max(240, Math.round(el.width));
  const h = Math.max(160, Math.round(el.height));
  const title = shortPrompt(el.prompt, '模擬內容');

  if (el.outputFormat === 'text' || el.kind === 'text') {
    return {
      type: 'text',
      content: `【模擬資料 · 非真實 AI 生成】\n\n${el.prompt || '（未填寫 Prompt）'}\n\n這段文字由本機模擬器產生，僅用於驗證「等待 AI 處理 → 已完成」的流程。`,
    };
  }

  switch (el.kind) {
    case 'chart':
      return { type: 'svg', content: mockChart(w, h, title) };
    case 'diagram':
      return { type: 'svg', content: mockDiagram(w, h, title) };
    case 'timeline':
      return { type: 'svg', content: mockTimeline(w, h, title) };
    case 'infographic':
      return { type: 'svg', content: mockInfographic(w, h, title) };
    case 'table':
      return { type: 'svg', content: mockTable(w, h, title) };
    default:
      return { type: 'svg', content: mockGeneric(w, h, title) };
  }
}

/**
 * 為指定（或全部待處理）的 AI 任務產生模擬 Patch。
 * 刻意走與外部 AI 相同的 Patch 通道，確保兩條路徑行為一致。
 */
export function buildMockPatch(
  presentation: Presentation,
  taskIds?: string[],
): PresentationPatch {
  const wanted = taskIds ? new Set(taskIds) : undefined;
  const operations: PresentationPatch['operations'] = [];

  for (const slide of presentation.slides) {
    for (const el of slide.elements) {
      if (el.type !== 'ai_component') continue;
      if (wanted ? !wanted.has(el.taskId) : el.status === 'completed') continue;
      const output = buildMockOutput(el);
      operations.push({
        operation: 'replace_ai_output',
        taskId: el.taskId,
        targetElementId: el.id,
        output: {
          type: output.type,
          content: output.content,
          producer: MOCK_PRODUCER,
          producedAt: new Date().toISOString(),
        },
      });
    }
  }

  return {
    protocol: PATCH_PROTOCOL,
    presentationId: presentation.metadata.id,
    generatedAt: new Date().toISOString(),
    operations,
  };
}

/** 產生一份「外部 AI 已完成」的 completed-presentation.json，供測試匯入流程。 */
export function buildMockCompletedPresentation(presentation: Presentation): Presentation {
  const next: Presentation = structuredClone(presentation);
  for (const slide of next.slides) {
    slide.elements = slide.elements.map((el) => {
      if (el.type !== 'ai_component' || el.status === 'completed') return el;
      const output = buildMockOutput(el);
      return {
        ...el,
        status: 'completed',
        result: {
          type: output.type,
          content: output.content,
          producer: MOCK_PRODUCER,
          producedAt: new Date().toISOString(),
        },
      };
    });
  }
  next.aiTasks = next.aiTasks.map((task) => {
    const slide = next.slides.find((s) => s.id === task.target.slideId);
    const el = slide?.elements.find((e) => e.id === task.target.elementId);
    if (el && el.type === 'ai_component' && el.result) {
      return { ...task, status: 'completed' as const, result: el.result };
    }
    return task;
  });
  return next;
}
