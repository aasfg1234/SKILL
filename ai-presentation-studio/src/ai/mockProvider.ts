import {
  createChartElement,
  createDefaultTheme,
  createEllipseElement,
  createImageElement,
  createLineElement,
  createPresentation,
  createRectElement,
  createSlide,
  createTextElement,
  createTableElement,
} from '../model/factory';
import { newId } from '../model/ids';
import { buildLayoutElements } from '../model/layouts';
import { sanitizeAiOutput } from '../model/sanitize';
import type { Presentation, SlideElement } from '../model/types';
import { parsePastedTable } from '../model/table';
import type {
  FullAiForm,
  GenerationProgress,
  OutlineLayoutId,
  OutlineSlide,
  PresentationOutline,
  SingleSlideAIProvider,
  SingleSlideForm,
  SingleSlideGenerationInput,
  SingleSlideGenerationProgress,
  SingleSlideType,
} from './types';

export interface MockAIProviderOptions {
  delayMs?: number;
  failSlideIndexesOnce?: number[];
  failAll?: boolean;
}

const SECTION_TITLES = [
  '現況與背景', '核心問題', '關鍵洞察', '解決方向', '執行方法',
  '資料與證據', '預期成果', '風險與因應', '行動計畫', '下一步',
];

function clean(value: string): string {
  return sanitizeAiOutput('text', value).content.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
}

function withoutExcluded(value: string, form: FullAiForm): string {
  return clean(form.excludedContent).split(/[\n,，、]+/).map((item) => item.trim()).filter(Boolean)
    .reduce((text, item) => text.split(item).join(''), value);
}

function clip(value: string, limit: number): string {
  const text = clean(value);
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function sentence(form: FullAiForm, title: string, index: number): string {
  const detail = form.textDensity === 'concise'
    ? `說明${title}的核心重點。`
    : form.textDensity === 'detailed'
      ? `從${clean(form.audience)}的需求出發，說明${title}的背景、做法、證據與可執行建議。`
      : `針對${clean(form.audience)}，整理${title}的重點、依據與建議。`;
  const required = index === 2 && form.requiredContent.trim()
    ? ` 必須涵蓋：${clean(form.requiredContent)}。`
    : '';
  const background = index === 1 && form.backgroundInfo.trim() ? ` 背景：${clean(form.backgroundInfo)}。` : '';
  const source = index === 5 && form.dataSources.trim() ? ` 資料來源：${clean(form.dataSources)}。` : '';
  return withoutExcluded(`${detail}${required}${background}${source}`, form);
}

function suggestedLayout(form: FullAiForm, index: number): OutlineLayoutId {
  if (index === 0) return 'title';
  if (form.useImages && index % 4 === 0) return 'image-text';
  if (index % 3 === 0) return 'two-column';
  return 'title-content';
}

function suggestedVisual(form: FullAiForm, index: number): string {
  if (index === 0) return '主視覺與簡報副標題';
  if (form.useCharts && index % 3 === 2) return '內建長條圖';
  if (form.useTimelines && index % 5 === 3) return '時間軸';
  if (form.useFlowcharts && index % 4 === 2) return '流程圖';
  if (form.useImages && index % 4 === 0) return '主題圖片';
  return '重點文字';
}

function imageDataUrl(primary: string, secondary: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="${primary}"/><circle cx="880" cy="260" r="210" fill="${secondary}" opacity=".8"/><path d="M0 690L420 330L690 570L900 410L1200 690V800H0Z" fill="white" opacity=".72"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function replaceLayoutText(elements: SlideElement[], item: OutlineSlide, subtitle: string, form: FullAiForm): SlideElement[] {
  let bodyIndex = 0;
  return elements.map((element) => {
    if (element.type === 'text') {
      const isHeading = element.fontSize >= 70;
      const text = isHeading ? item.title : bodyIndex++ === 0 ? item.summary : subtitle || item.summary;
      return { ...element, text: clip(withoutExcluded(text, form), isHeading ? 42 : 170) };
    }
    return element;
  });
}

function visualElements(
  form: FullAiForm,
  item: OutlineSlide,
  width: number,
  height: number,
): SlideElement[] {
  const options = { width, height, accent: form.secondaryColor };
  let elements = replaceLayoutText(buildLayoutElements(item.layoutId, options), item, form.purpose, form);
  const heading = elements.filter((element) => element.type === 'text' && element.fontSize >= 70);
  const visual = item.visualSuggestion;

  if ((visual.includes('圖表') || visual.includes('長條圖')) && form.useCharts) {
    const seed = Math.max(10, clean(form.topic).length * 4);
    elements = [
      ...heading,
      createChartElement({
        x: 140, y: 320, width: width - 280, height: height - 430, z: 4,
        title: item.title,
        labels: ['現況', '近期', '目標', '展望'],
        series: [{ name: clean(form.topic), values: [seed, seed + 12, seed + 27, seed + 42] }],
        colors: [form.primaryColor, form.secondaryColor],
      }),
    ];
  } else if (visual.includes('流程圖') && form.useFlowcharts) {
    const y = Math.round(height * 0.48);
    elements = [...heading];
    ['理解需求', '整理資訊', '形成行動'].forEach((label, step) => {
      const x = 170 + step * Math.round((width - 540) / 3);
      elements.push(createRectElement({ x, y, width: 400, height: 170, fill: step === 1 ? form.secondaryColor : '#EEF2FF', radius: 28, z: 4 + step * 2 }));
      elements.push(createTextElement({ x: x + 30, y: y + 35, width: 340, height: 100, text: label, fontSize: 38, bold: true, align: 'center', z: 5 + step * 2 }));
      if (step < 2) elements.push(createLineElement({ x: x + 400, y: y + 82, width: 90, height: 8, stroke: form.primaryColor, strokeWidth: 6, arrowEnd: true, z: 10 }));
    });
  } else if (visual.includes('時間軸') && form.useTimelines) {
    const y = Math.round(height * 0.56);
    elements = [...heading, createLineElement({ x: 220, y, width: width - 440, height: 8, stroke: form.primaryColor, strokeWidth: 8, z: 3 })];
    ['現在', '近期', '下一步'].forEach((label, step) => {
      const x = 250 + step * Math.round((width - 700) / 2);
      elements.push(createTextElement({ x: x - 80, y: y - 150, width: 240, height: 90, text: label, fontSize: 38, bold: true, align: 'center', z: 5 }));
      elements.push(createRectElement({ x, y: y - 22, width: 44, height: 44, radius: 22, fill: form.secondaryColor, z: 6 }));
    });
  } else if (item.layoutId === 'image-text' && form.useImages) {
    elements = elements.map((element) => element.type === 'image'
      ? createImageElement({ ...element, src: imageDataUrl(form.primaryColor, form.secondaryColor), alt: `${clean(form.topic)}示意圖` })
      : element);
  }

  return elements.map((element, z) => ({ ...element, z: z + 1 }));
}

function buildMasters(form: FullAiForm, width: number, height: number) {
  const coverDark = form.coverMaster === 'bold';
  return {
    cover: createSlide({
      id: newId('master-cover'), title: '封面母片', masterKind: 'cover',
      background: coverDark ? form.primaryColor : '#F8FAFC', useMasterBackground: false,
      elements: [createRectElement({ x: 0, y: height - 22, width, height: 22, fill: form.secondaryColor, radius: 0, z: 1 })],
    }),
    content: createSlide({
      id: newId('master-content'), title: '內容母片', masterKind: 'content',
      background: form.contentMaster === 'card' ? '#F1F5F9' : '#FFFFFF', useMasterBackground: false,
      elements: [createLineElement({ x: 140, y: height - 76, width: width - 280, height: 2, stroke: form.primaryColor, strokeWidth: 2, z: 1 })],
    }),
  };
}

function singlePalette(form: SingleSlideForm, input: SingleSlideGenerationInput) {
  if (form.extraRequest.includes('沉穩')) return { primary: '#1E293B', accent: '#475569', surface: '#E2E8F0' };
  switch (form.visualStyle) {
    case 'technology': return { primary: '#0F172A', accent: '#06B6D4', surface: '#CFFAFE' };
    case 'lively': return { primary: '#7C3AED', accent: '#F97316', surface: '#FFEDD5' };
    case 'teaching': return { primary: '#2563EB', accent: '#16A34A', surface: '#DCFCE7' };
    case 'formal': return { primary: '#1F2937', accent: '#6B7280', surface: '#F3F4F6' };
    default: return { primary: input.context.primaryColor, accent: input.context.secondaryColor, surface: '#EEF2FF' };
  }
}

function resolvedSingleType(form: SingleSlideForm): SingleSlideType {
  if (form.extraRequest.includes('左右比較')) return 'comparison';
  if (form.extraRequest.includes('長條圖')) return 'chart';
  if (form.pageType !== 'auto') return form.pageType;
  const text = `${form.topic}${form.keyMessage}`;
  if (/數據|成長|比例|趨勢|營收/.test(text)) return 'chart';
  if (/流程|步驟|方法/.test(text)) return 'flowchart';
  if (/比較|差異|優缺點/.test(text)) return 'comparison';
  if (/時間|歷程|里程碑/.test(text)) return 'timeline';
  return 'summary';
}

function singleText(text: string, input: SingleSlideGenerationInput, init: Parameters<typeof createTextElement>[0]) {
  const short = input.form.extraRequest.includes('文字再少');
  return createTextElement({ ...init, text: clip(text, short ? 46 : 100), fontFamily: input.context.fontFamily });
}

function singleSlideElements(input: SingleSlideGenerationInput): SlideElement[] {
  const { form, context } = input;
  const { width, height } = context;
  const type = resolvedSingleType(form);
  const colors = singlePalette(form, input);
  const title = form.extraRequest.includes('標題更有力') ? `${form.topic}：立即行動` : form.topic;
  const elements: SlideElement[] = [];
  const add = (element: SlideElement) => elements.push({ ...element, z: elements.length + 1 });
  const heading = () => {
    add(singleText(title, input, { x: 140, y: 85, width: width - 280, height: 120, fontSize: 72, bold: true, color: colors.primary }));
    add(createRectElement({ x: 140, y: 225, width: 150, height: 10, fill: colors.accent, radius: 5 }));
  };

  if (type === 'title') {
    add(singleText(title, input, { x: 200, y: Math.round(height * .34), width: width - 400, height: 180, fontSize: 96, bold: true, color: colors.primary }));
    add(singleText(form.keyMessage, input, { x: 200, y: Math.round(height * .56), width: width - 400, height: 150, fontSize: 42, color: colors.accent }));
  } else if (type === 'comparison') {
    heading();
    ['目前做法', '建議做法'].forEach((label, index) => {
      const groupId = newId('group-comparison');
      const x = index === 0 ? 140 : width / 2 + 40;
      const boxWidth = width / 2 - 180;
      add(createRectElement({ groupId, groupName: label, x, y: 300, width: boxWidth, height: height - 450, fill: index ? colors.surface : '#F8FAFC', stroke: index ? colors.accent : '#CBD5E1', strokeWidth: 3, radius: 28 }));
      add(singleText(label, input, { groupId, groupName: label, x: x + 45, y: 345, width: boxWidth - 90, height: 80, fontSize: 40, bold: true, color: colors.primary }));
      add(singleText(index ? form.keyMessage : `承接「${context.previousTitle || context.presentationTitle}」後，需要改善的現況。`, input, { groupId, groupName: label, x: x + 45, y: 455, width: boxWidth - 90, height: height - 650, fontSize: 32, color: '#334155', verticalAlign: 'top' }));
    });
  } else if (type === 'chart') {
    heading();
    const numbers = form.referenceContent.match(/-?\d+(?:\.\d+)?/g)?.slice(0, 5).map(Number) ?? [28, 42, 57, 73];
    const labels = numbers.map((_, index) => `項目 ${index + 1}`);
    add(createChartElement({ x: 140, y: 290, width: width - 280, height: height - 440, title: form.keyMessage, labels, series: [{ name: form.topic, values: numbers }], colors: [colors.primary, colors.accent] }));
  } else if (type === 'flowchart') {
    heading();
    const labels = ['確認目標', '執行重點', '完成成果'];
    labels.forEach((label, index) => {
      const groupId = newId('group-flow');
      const x = 150 + index * Math.round((width - 550) / 3);
      add(createRectElement({ groupId, groupName: `流程 ${index + 1}`, x, y: 390, width: 420, height: 210, fill: index === 1 ? colors.surface : '#F8FAFC', stroke: colors.accent, strokeWidth: 3, radius: 30 }));
      add(singleText(index === 1 ? form.keyMessage : label, input, { groupId, groupName: `流程 ${index + 1}`, x: x + 35, y: 435, width: 350, height: 120, fontSize: 34, bold: true, align: 'center', color: colors.primary }));
      if (index < 2) add(createLineElement({ x: x + 420, y: 490, width: 100, height: 8, stroke: colors.accent, strokeWidth: 6, arrowEnd: true }));
    });
  } else if (type === 'timeline') {
    heading();
    add(createLineElement({ x: 220, y: 530, width: width - 440, height: 8, stroke: colors.primary, strokeWidth: 8 }));
    ['起點', '推進', '成果'].forEach((label, index) => {
      const groupId = newId('group-timeline');
      const x = 260 + index * Math.round((width - 600) / 2);
      add(createEllipseElement({ groupId, groupName: `時間點 ${index + 1}`, x, y: 500, width: 68, height: 68, fill: colors.accent, strokeWidth: 0 }));
      add(singleText(index === 1 ? form.keyMessage : label, input, { groupId, groupName: `時間點 ${index + 1}`, x: x - 110, y: index % 2 ? 610 : 350, width: 290, height: 110, fontSize: 34, bold: true, align: 'center', color: colors.primary }));
    });
  } else if (type === 'table') {
    heading();
    const parsed = parsePastedTable(form.referenceContent);
    const cells = parsed ?? [['項目', '說明', '狀態'], ['重點一', form.keyMessage, '進行中'], ['重點二', '後續行動', '待確認']];
    add(createTableElement({ x: 140, y: 300, width: width - 280, height: height - 460, cells, headerRow: true, fontFamily: context.fontFamily }));
  } else if (type === 'image-text') {
    heading();
    const groupId = newId('group-image-placeholder');
    add(createRectElement({ groupId, groupName: '圖片預留框', x: 140, y: 300, width: 820, height: height - 470, fill: '#F1F5F9', stroke: colors.accent, strokeWidth: 3, radius: 24 }));
    add(singleText(`圖片用途：支援「${form.topic}」\n建議畫面：與本頁重點相關的照片或場景插圖\n圖片比例：4:3\n替代文字：${form.topic}示意圖`, input, { groupId, groupName: '圖片預留框', x: 200, y: 390, width: 700, height: 300, fontSize: 30, color: '#64748B', verticalAlign: 'top' }));
    add(singleText(form.keyMessage, input, { x: 1030, y: 330, width: width - 1170, height: height - 520, fontSize: 38, color: colors.primary, verticalAlign: 'top' }));
  } else if (type === 'conclusion') {
    heading();
    const groupId = newId('group-conclusion');
    add(createRectElement({ groupId, groupName: '結論資訊卡', x: 220, y: 330, width: width - 440, height: height - 520, fill: colors.surface, stroke: colors.accent, strokeWidth: 3, radius: 36 }));
    add(singleText(form.keyMessage, input, { groupId, groupName: '結論資訊卡', x: 300, y: 400, width: width - 600, height: height - 690, fontSize: 46, bold: true, color: colors.primary, align: 'center' }));
  } else {
    heading();
    add(singleText(form.keyMessage, input, { x: 160, y: 320, width: width - 320, height: height - 500, fontSize: 42, color: colors.primary, verticalAlign: 'top' }));
  }
  return elements;
}

export class MockAIProvider implements SingleSlideAIProvider {
  readonly name = 'MockAIProvider';
  private cancelled = false;
  private singleCancelled = false;
  private failOnce = new Set<number>();
  private readonly delayMs: number;
  private readonly failAll: boolean;

  constructor(options: MockAIProviderOptions = {}) {
    this.delayMs = options.delayMs ?? 90;
    this.failAll = options.failAll ?? false;
    this.failOnce = new Set(options.failSlideIndexesOnce ?? []);
  }

  cancel(): void {
    this.cancelled = true;
  }

  cancelSingleSlideGeneration(): void {
    this.singleCancelled = true;
  }

  private async singlePause(progress: SingleSlideGenerationProgress, onProgress?: (progress: SingleSlideGenerationProgress) => void): Promise<void> {
    onProgress?.(progress);
    if (this.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    if (this.singleCancelled) throw new DOMException('使用者已停止單頁生成。', 'AbortError');
  }

  async generateSingleSlide(input: SingleSlideGenerationInput, onProgress?: (progress: SingleSlideGenerationProgress) => void) {
    this.singleCancelled = false;
    await this.singlePause({ step: 'understanding', label: '理解本頁主題與前後內容', percent: 20 }, onProgress);
    await this.singlePause({ step: 'layout', label: '選擇版型與可編輯物件', percent: 45 }, onProgress);
    await this.singlePause({ step: 'content', label: '建立文字、圖形與資料', percent: 75 }, onProgress);
    const slide = createSlide({
      title: clean(input.form.topic),
      masterKind: 'content',
      useMasterBackground: true,
      notes: input.form.generateNotes ? `承接前一頁「${clean(input.context.previousTitle)}」。說明：${clean(input.form.keyMessage)}。${clean(input.form.extraRequest)}` : '',
      elements: singleSlideElements(input),
    });
    await this.singlePause({ step: 'validation', label: '檢查邊界、重疊與資料格式', percent: 100 }, onProgress);
    return slide;
  }

  async regenerateSingleSlide(input: SingleSlideGenerationInput, onProgress?: (progress: SingleSlideGenerationProgress) => void) {
    return this.generateSingleSlide(input, onProgress);
  }

  private async pause(): Promise<void> {
    if (this.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    if (this.cancelled) throw new DOMException('使用者已停止生成。', 'AbortError');
  }

  async generateOutline(form: FullAiForm): Promise<PresentationOutline> {
    this.cancelled = false;
    await this.pause();
    const topic = clean(form.topic);
    const slides = Array.from({ length: form.slideCount }, (_, index): OutlineSlide => {
      const last = index === form.slideCount - 1;
      const section = index === 0 ? topic : last ? '結論與下一步' : SECTION_TITLES[(index - 1) % SECTION_TITLES.length];
      return {
        id: newId('outline'),
        title: section,
        summary: index === 0 ? clean(form.purpose) : sentence(form, section, index),
        layoutId: suggestedLayout(form, index),
        visualSuggestion: suggestedVisual(form, index),
        notesSummary: form.generateNotes ? `用${form.tone}語氣說明「${section}」，本頁約講 ${Math.max(1, Math.round(form.durationMinutes / form.slideCount))} 分鐘。` : '',
        locked: false,
      };
    });
    return {
      title: topic,
      subtitle: `${clean(form.purpose)}｜對象：${clean(form.audience)}｜${clean(form.language)}｜${clean(form.visualStyle)}`,
      slides,
    };
  }

  async regenerateSlide(form: FullAiForm, slide: OutlineSlide, index: number): Promise<OutlineSlide> {
    this.cancelled = false;
    await this.pause();
    return {
      ...slide,
      id: slide.id,
      summary: `${sentence(form, slide.title, index)} 已依「${clean(form.topic)}」重新整理。`,
      visualSuggestion: suggestedVisual(form, index + 1),
      notesSummary: form.generateNotes ? `補充本頁與「${clean(form.purpose)}」的關係，並帶出下一頁。` : '',
    };
  }

  async generatePresentation(
    form: FullAiForm,
    outline: PresentationOutline,
    onProgress?: (progress: GenerationProgress) => void,
  ): Promise<Presentation> {
    this.cancelled = false;
    if (this.failAll) throw new Error('Mock AI 無法產生簡報。請調整內容後再試一次。');
    const width = 1920;
    const height = form.aspectRatio === '4:3' ? 1440 : 1080;
    const slides = [];
    for (let index = 0; index < outline.slides.length; index += 1) {
      const item = outline.slides[index];
      onProgress?.({ slideId: item.id, index, total: outline.slides.length, status: 'generating' });
      await this.pause();
      const shouldFail = this.failOnce.delete(index);
      if (shouldFail) {
        onProgress?.({ slideId: item.id, index, total: outline.slides.length, status: 'failed', message: '這一頁生成失敗，請按重新生成失敗頁面。' });
      } else {
        onProgress?.({ slideId: item.id, index, total: outline.slides.length, status: 'success' });
      }
      const isCover = index === 0;
      slides.push(createSlide({
        title: clean(item.title),
        masterKind: isCover ? 'cover' : 'content',
        useMasterBackground: true,
        notes: form.generateNotes ? clean(item.notesSummary) : '',
        elements: visualElements(form, item, width, height),
      }));
    }

    const theme = createDefaultTheme();
    theme.palette.primary = form.primaryColor;
    theme.palette.accent = form.secondaryColor;
    return createPresentation({
      metadata: {
        id: newId('pres'), title: clean(outline.title), author: 'Mock AI',
        description: clean(outline.subtitle), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      },
      settings: { width, height, aspectRatio: form.aspectRatio, showSlideNumbers: form.showSlideNumbers, hideNumberOnCover: true },
      theme,
      masters: buildMasters(form, width, height),
      slides,
      aiTasks: [],
      execution: { mode: 'external-handoff', provider: this.name },
    });
  }
}

export const fullAiProvider: SingleSlideAIProvider = new MockAIProvider();
