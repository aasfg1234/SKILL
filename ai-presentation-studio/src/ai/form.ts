import type { FullAiForm, QuickPresetId } from './types';

export const DEFAULT_FULL_AI_FORM: FullAiForm = {
  topic: '',
  purpose: '',
  audience: '',
  slideCount: 10,
  language: '繁體中文',
  aspectRatio: '16:9',
  durationMinutes: 15,
  backgroundInfo: '',
  requiredContent: '',
  excludedContent: '',
  referenceUrls: '',
  dataSources: '',
  generateNotes: true,
  textDensity: 'normal',
  tone: 'professional',
  visualStyle: '簡約現代',
  primaryColor: '#4F46E5',
  secondaryColor: '#0EA5E9',
  useCharts: true,
  useTimelines: false,
  useFlowcharts: false,
  useImages: true,
  showSlideNumbers: true,
  coverMaster: 'minimal',
  contentMaster: 'standard',
};

export interface QuickPreset {
  id: QuickPresetId;
  name: string;
  values: Partial<FullAiForm>;
}

export const QUICK_PRESETS: QuickPreset[] = [
  { id: 'business', name: '商務簡報', values: { purpose: '清楚說明現況、重點與下一步', audience: '主管與工作團隊', tone: 'professional', textDensity: 'normal', visualStyle: '簡約商務', useCharts: true, useImages: false } },
  { id: 'teaching', name: '教學簡報', values: { purpose: '讓觀眾理解並能實際應用', audience: '學習者', tone: 'teaching', textDensity: 'detailed', visualStyle: '清楚教學', useCharts: false, useFlowcharts: true, useImages: true } },
  { id: 'proposal', name: '提案簡報', values: { purpose: '說服決策者採用提案', audience: '決策者與利害關係人', tone: 'sales', textDensity: 'concise', visualStyle: '有力提案', useCharts: true, useImages: true } },
  { id: 'product', name: '產品介紹', values: { purpose: '介紹產品價值、功能與使用情境', audience: '潛在客戶', tone: 'sales', textDensity: 'normal', visualStyle: '產品展示', useCharts: false, useFlowcharts: true, useImages: true } },
  { id: 'data-report', name: '數據報告', values: { purpose: '呈現數據發現並提出建議', audience: '主管與分析團隊', tone: 'formal', textDensity: 'detailed', visualStyle: '數據報告', useCharts: true, useTimelines: true, useImages: false } },
  { id: 'story', name: '故事型簡報', values: { purpose: '用故事帶出核心觀點與行動', audience: '一般觀眾', tone: 'story', textDensity: 'concise', visualStyle: '故事敘事', useCharts: false, useTimelines: true, useImages: true } },
];

export function applyQuickPreset(form: FullAiForm, presetId: QuickPresetId): FullAiForm {
  const preset = QUICK_PRESETS.find((item) => item.id === presetId);
  return preset ? { ...form, ...preset.values } : form;
}

export function validateFullAiForm(form: FullAiForm): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.topic.trim()) errors.topic = '請填寫簡報主題。';
  if (!form.purpose.trim()) errors.purpose = '請填寫簡報目的。';
  if (!form.audience.trim()) errors.audience = '請填寫目標觀眾。';
  if (!Number.isInteger(form.slideCount) || form.slideCount < 3 || form.slideCount > 30) {
    errors.slideCount = '投影片數量必須是 3 到 30 的整數。';
  }
  if (!Number.isFinite(form.durationMinutes) || form.durationMinutes < 1 || form.durationMinutes > 300) {
    errors.durationMinutes = '演講時間必須是 1 到 300 分鐘。';
  }
  if (!/^#[0-9a-f]{6}$/i.test(form.primaryColor)) errors.primaryColor = '主要顏色必須是六位色碼。';
  if (!/^#[0-9a-f]{6}$/i.test(form.secondaryColor)) errors.secondaryColor = '輔助顏色必須是六位色碼。';
  return errors;
}

