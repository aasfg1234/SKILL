import type { Presentation, Slide } from '../model/types';

export type QuickPresetId =
  | 'business'
  | 'teaching'
  | 'proposal'
  | 'product'
  | 'data-report'
  | 'story';

export type TextDensity = 'concise' | 'normal' | 'detailed';
export type ContentTone = 'professional' | 'teaching' | 'sales' | 'story' | 'formal';
export type AspectRatio = '16:9' | '4:3';

export interface FullAiForm {
  topic: string;
  purpose: string;
  audience: string;
  slideCount: number;
  language: string;
  aspectRatio: AspectRatio;
  durationMinutes: number;
  backgroundInfo: string;
  requiredContent: string;
  excludedContent: string;
  referenceUrls: string;
  dataSources: string;
  generateNotes: boolean;
  textDensity: TextDensity;
  tone: ContentTone;
  visualStyle: string;
  primaryColor: string;
  secondaryColor: string;
  useCharts: boolean;
  useTimelines: boolean;
  useFlowcharts: boolean;
  useImages: boolean;
  showSlideNumbers: boolean;
  coverMaster: 'minimal' | 'bold';
  contentMaster: 'standard' | 'card';
}

export type OutlineLayoutId = 'title' | 'title-content' | 'two-column' | 'image-text';

export interface OutlineSlide {
  id: string;
  title: string;
  summary: string;
  layoutId: OutlineLayoutId;
  visualSuggestion: string;
  notesSummary: string;
  locked: boolean;
}

export interface PresentationOutline {
  title: string;
  subtitle: string;
  slides: OutlineSlide[];
}

export type GenerationSlideStatus = 'waiting' | 'generating' | 'success' | 'failed' | 'stopped';

export interface GenerationProgress {
  slideId: string;
  index: number;
  total: number;
  status: GenerationSlideStatus;
  message?: string;
}

export interface AIProvider {
  readonly name: string;
  generateOutline(form: FullAiForm): Promise<PresentationOutline>;
  generatePresentation(
    form: FullAiForm,
    outline: PresentationOutline,
    onProgress?: (progress: GenerationProgress) => void,
  ): Promise<Presentation>;
  regenerateSlide(form: FullAiForm, slide: OutlineSlide, index: number): Promise<OutlineSlide>;
  cancel(): void;
}

export type GeneratedDeckAction = 'new' | 'append' | 'replace';

export type SingleSlideType =
  | 'auto' | 'title' | 'summary' | 'image-text' | 'comparison'
  | 'chart' | 'flowchart' | 'timeline' | 'table' | 'conclusion';
export type SingleSlideVisualStyle = 'follow' | 'business' | 'minimal' | 'technology' | 'teaching' | 'lively' | 'formal';

export interface SingleSlideForm {
  topic: string;
  keyMessage: string;
  pageType: SingleSlideType;
  visualStyle: SingleSlideVisualStyle;
  referenceContent: string;
  extraRequest: string;
  generateNotes: boolean;
}

export interface SingleSlideContext {
  presentationId: string;
  presentationTitle: string;
  language: string;
  width: number;
  height: number;
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
  contentMaster: Slide;
  previousTitle: string;
  nextTitle: string;
  previousSummary: string;
  insertAfterSlideId: string;
  insertIndex: number;
  showSlideNumbers: boolean;
}

export interface SingleSlideGenerationInput {
  form: SingleSlideForm;
  context: SingleSlideContext;
}

export interface SingleSlideGenerationProgress {
  step: 'understanding' | 'layout' | 'content' | 'validation';
  label: string;
  percent: number;
}

export interface SingleSlideAIProvider extends AIProvider {
  generateSingleSlide(
    input: SingleSlideGenerationInput,
    onProgress?: (progress: SingleSlideGenerationProgress) => void,
  ): Promise<Slide>;
  regenerateSingleSlide(
    input: SingleSlideGenerationInput,
    onProgress?: (progress: SingleSlideGenerationProgress) => void,
  ): Promise<Slide>;
  cancelSingleSlideGeneration(): void;
}
