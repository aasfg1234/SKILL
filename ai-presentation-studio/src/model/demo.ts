import {
  createAiComponentElement,
  createDefaultTheme,
  createLineElement,
  createPresentation,
  createRectElement,
  createSlide,
  createTextElement,
  syncAiTasks,
} from './factory';
import type { Presentation } from './types';

/**
 * 第一次啟動時自動建立的示範簡報：「2026 AI 科技趨勢」。
 *
 * 使用可讀的固定 ID（slide-01 / ai-chart-001 / TASK-001），
 * 讓使用者與外部 AI 都能一眼看出任務對應關係。
 */
export function createDemoPresentation(): Presentation {
  const theme = createDefaultTheme();

  const heading = (id: string, text: string) =>
    createTextElement({
      id,
      text,
      x: 140,
      y: 110,
      width: 1640,
      height: 130,
      fontSize: 76,
      bold: true,
      color: '#111827',
      align: 'left',
      verticalAlign: 'middle',
      z: 2,
    });

  const accentBar = (id: string) =>
    createRectElement({
      id,
      x: 140,
      y: 258,
      width: 160,
      height: 10,
      radius: 5,
      fill: theme.palette.primary,
      strokeWidth: 0,
      z: 1,
    });

  const slide1 = createSlide({
    id: 'slide-01',
    title: '2026 AI 科技趨勢',
    background: '#FFFFFF',
    notes: '開場：說明本簡報由 AI Presentation Studio 製作，AI 內容交由外部 AI 完成。',
    elements: [
      createRectElement({
        id: 'el-cover-bg',
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
        radius: 0,
        fill: '#F5F7FA',
        strokeWidth: 0,
        z: 1,
      }),
      createTextElement({
        id: 'el-cover-title',
        text: '2026 AI 科技趨勢',
        x: 200,
        y: 380,
        width: 1520,
        height: 180,
        fontSize: 112,
        bold: true,
        color: '#111827',
        align: 'left',
        verticalAlign: 'middle',
        z: 3,
      }),
      createLineElement({
        id: 'el-cover-line',
        x: 200,
        y: 590,
        width: 220,
        height: 8,
        stroke: theme.palette.primary,
        strokeWidth: 8,
        z: 4,
      }),
      createTextElement({
        id: 'el-cover-subtitle',
        text: 'AI-Native Presentation Demo',
        x: 200,
        y: 630,
        width: 1200,
        height: 90,
        fontSize: 44,
        color: '#6B7280',
        align: 'left',
        verticalAlign: 'middle',
        z: 5,
      }),
    ],
  });

  const slide2 = createSlide({
    id: 'slide-02',
    title: 'AI 市場成長',
    notes: '此頁的圖表由外部 AI 依 TASK-001 生成。',
    elements: [
      heading('el-title-02', 'AI 市場成長'),
      accentBar('el-bar-02'),
      createAiComponentElement({
        id: 'ai-chart-001',
        taskId: 'TASK-001',
        kind: 'chart',
        outputFormat: 'svg',
        status: 'pending',
        prompt: '製作 2024～2026 AI 市場成長趨勢圖。使用專業企業簡報風格。',
        x: 140,
        y: 320,
        width: 1640,
        height: 620,
        z: 3,
      }),
    ],
  });

  const slide3 = createSlide({
    id: 'slide-03',
    title: '生成式 AI 技術架構',
    notes: '此頁的架構圖由外部 AI 依 TASK-002 生成。',
    elements: [
      heading('el-title-03', '生成式 AI 技術架構'),
      accentBar('el-bar-03'),
      createAiComponentElement({
        id: 'ai-diagram-001',
        taskId: 'TASK-002',
        kind: 'diagram',
        outputFormat: 'svg',
        status: 'pending',
        prompt: '製作生成式 AI 技術架構圖，包含模型、資料、Agent、應用層。',
        x: 140,
        y: 320,
        width: 1640,
        height: 620,
        z: 3,
      }),
    ],
  });

  const slide4 = createSlide({
    id: 'slide-04',
    title: 'AI 發展時間軸',
    notes: '此頁的時間軸由外部 AI 依 TASK-003 生成。',
    elements: [
      heading('el-title-04', 'AI 發展時間軸'),
      accentBar('el-bar-04'),
      createAiComponentElement({
        id: 'ai-timeline-001',
        taskId: 'TASK-003',
        kind: 'timeline',
        outputFormat: 'svg',
        status: 'pending',
        prompt: '製作 2024～2026 AI 發展時間軸。',
        x: 140,
        y: 340,
        width: 1640,
        height: 520,
        z: 3,
      }),
    ],
  });

  const slide5 = createSlide({
    id: 'slide-05',
    title: '未來展望',
    notes: '此頁的資訊圖表由外部 AI 依 TASK-004 生成。',
    elements: [
      heading('el-title-05', '未來展望'),
      accentBar('el-bar-05'),
      createAiComponentElement({
        id: 'ai-infographic-001',
        taskId: 'TASK-004',
        kind: 'infographic',
        outputFormat: 'svg',
        status: 'pending',
        prompt: '製作 AI 未來發展的四個核心趨勢資訊圖表。',
        x: 140,
        y: 320,
        width: 1640,
        height: 620,
        z: 3,
      }),
    ],
  });

  const presentation = createPresentation({
    metadata: {
      id: 'pres-demo-2026',
      title: '2026 AI 科技趨勢',
      author: 'AI Presentation Studio',
      description: '示範 AI-Native 簡報流程：宣告 AI 任務 → 交付外部 AI → 匯回結果。',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    theme,
    slides: [slide1, slide2, slide3, slide4, slide5],
  });

  return syncAiTasks(presentation);
}
