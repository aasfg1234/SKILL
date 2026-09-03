import { useState } from 'react';
import { auditEditableSlide } from '../ai/editableAudit';
import { fullAiProvider } from '../ai/mockProvider';
import { buildSingleSlideContext, DEFAULT_SINGLE_SLIDE_FORM, validateSingleSlideCandidate, validateSingleSlideForm } from '../ai/singleSlide';
import type { SingleSlideForm, SingleSlideGenerationProgress } from '../ai/types';
import { LAYER } from '../lib/layers';
import { effectiveSlideBackground } from '../model/master';
import type { Slide } from '../model/types';
import { editorStore, useEditorState } from '../store/editorStore';
import { ElementView, sortByZ } from './ElementView';
import { Icon } from './Icon';

type Phase = 'settings' | 'generating' | 'preview';

const PAGE_TYPES: Array<[SingleSlideForm['pageType'], string]> = [
  ['auto', '自動判斷'], ['title', '標題頁'], ['summary', '重點摘要'], ['image-text', '圖文介紹'],
  ['comparison', '左右比較'], ['chart', '數據圖表'], ['flowchart', '流程圖'], ['timeline', '時間軸'],
  ['table', '表格'], ['conclusion', '結論頁'],
];
const VISUAL_STYLES: Array<[SingleSlideForm['visualStyle'], string]> = [
  ['follow', '跟隨目前簡報'], ['business', '商務'], ['minimal', '簡潔'], ['technology', '科技'],
  ['teaching', '教學'], ['lively', '活潑'], ['formal', '正式'],
];

function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return <label className="block text-[11.5px] text-ink-2"><span className="mb-1 block font-bold">{label}{required && <span style={{ color: 'var(--color-danger)' }}> *</span>}</span>{children}{error && <span className="mt-1 block" style={{ color: 'var(--color-danger)' }}>{error}</span>}</label>;
}

function SlidePreview({ slide }: { slide: Slide }) {
  const state = useEditorState();
  const { width, height } = state.presentation.settings;
  const previewWidth = 640;
  const scale = previewWidth / width;
  const master = state.presentation.masters?.content;
  return (
    <div className="mx-auto overflow-hidden rounded-lg border shadow-lg" style={{ width: previewWidth, height: height * scale, background: effectiveSlideBackground(state.presentation, slide, 1), borderColor: 'var(--color-line)' }}>
      <div className="relative" style={{ width, height, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
        {sortByZ(master?.elements ?? []).map((element) => <ElementView key={`master-${element.id}`} el={element} mode="present" />)}
        {sortByZ(slide.elements).map((element) => <ElementView key={element.id} el={element} mode="present" />)}
      </div>
    </div>
  );
}

export function SingleSlideAiDialog() {
  const state = useEditorState();
  const [context] = useState(() => buildSingleSlideContext(state.presentation, state.currentSlideId, state.selectedSlideIds));
  const [form, setForm] = useState(DEFAULT_SINGLE_SLIDE_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<Phase>('settings');
  const [progress, setProgress] = useState<SingleSlideGenerationProgress | null>(null);
  const [preview, setPreview] = useState<Slide | null>(null);
  const [message, setMessage] = useState('新頁會插入選取範圍的最後一頁後面。');
  const set = <K extends keyof SingleSlideForm>(key: K, value: SingleSlideForm[K]) => setForm((current) => ({ ...current, [key]: value }));

  const close = () => {
    if (phase === 'generating') {
      setMessage('生成進行中。請先按「停止生成」。');
      return;
    }
    editorStore.closeDialog();
  };

  const generate = async (regenerate = false) => {
    if (phase === 'generating') return;
    const nextErrors = validateSingleSlideForm(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setMessage('請先填寫紅色欄位，再產生預覽。');
      return;
    }
    setPhase('generating');
    setMessage('正在建立可直接編輯的元件。');
    try {
      const input = { form, context };
      const next = regenerate
        ? await fullAiProvider.regenerateSingleSlide(input, setProgress)
        : await fullAiProvider.generateSingleSlide(input, setProgress);
      const validation = validateSingleSlideCandidate(next, context);
      const audit = auditEditableSlide(next, context.width, context.height);
      const issue = validation.errors[0] ?? audit.issues[0];
      if (!validation.ok || audit.issues.length > 0) throw new Error(`${issue}請修改設定後再試。`);
      setPreview(next);
      setPhase('preview');
      setMessage(`預覽已完成。原生可編輯元件 ${audit.nativeCount} 個，SVG ${audit.svgCount} 個，圖片 ${audit.imageCount} 個。`);
    } catch (error) {
      const stopped = error instanceof DOMException && error.name === 'AbortError';
      setPhase(preview ? 'preview' : 'settings');
      setMessage(stopped ? '已停止生成。目前簡報沒有改動。' : error instanceof Error ? error.message : '生成失敗。請檢查設定後再試。');
    } finally {
      setProgress(null);
    }
  };

  const addToDeck = () => {
    if (!preview) return;
    if (!editorStore.insertGeneratedSlide(preview, context)) return;
    editorStore.closeDialog();
    editorStore.toast({ tone: 'success', title: 'AI 單頁已加入簡報', detail: '按一次復原會移除整張，重作會完整恢復。' });
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/50 p-5" style={{ zIndex: LAYER.dialog }} onClick={close}>
      <div className="panel-card aps-fade-in flex max-h-[92vh] w-full max-w-[820px] flex-col overflow-hidden shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <header className="flex items-start justify-between border-b px-5 py-4" style={{ borderColor: 'var(--color-line)' }}>
          <div><h2 className="text-[16px] font-bold">AI 生成單頁</h2><p className="mt-1 text-[11.5px] text-ink-3">Mock AI 只在本機產生內容。預覽不會改動簡報。</p></div>
          <button type="button" className="tool-btn px-2" aria-label="關閉 AI 生成單頁" onClick={close}><Icon name="close" size={15} /></button>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto p-5">
          {phase === 'settings' && <div className="space-y-3">
            <Field label="本頁主題" required error={errors.topic}><input autoFocus className="field-input" value={form.topic} onChange={(event) => set('topic', event.target.value)} /></Field>
            <Field label="本頁要表達的重點" required error={errors.keyMessage}><textarea className="field-input min-h-20" value={form.keyMessage} onChange={(event) => set('keyMessage', event.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="頁面類型"><select className="field-input" value={form.pageType} onChange={(event) => set('pageType', event.target.value as SingleSlideForm['pageType'])}>{PAGE_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
              <Field label="視覺風格"><select className="field-input" value={form.visualStyle} onChange={(event) => set('visualStyle', event.target.value as SingleSlideForm['visualStyle'])}>{VISUAL_STYLES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
            </div>
            <Field label="資料或參考內容"><textarea className="field-input min-h-16" placeholder="數據可直接輸入，例如：28、42、57、73" value={form.referenceContent} onChange={(event) => set('referenceContent', event.target.value)} /></Field>
            <Field label="補充要求"><input className="field-input" placeholder="例如：文字再少一點" value={form.extraRequest} onChange={(event) => set('extraRequest', event.target.value)} /></Field>
            <label className="flex items-center gap-2 text-[11.5px] text-ink-2"><input type="checkbox" checked={form.generateNotes} onChange={(event) => set('generateNotes', event.target.checked)} />產生講者備註</label>
            <div className="rounded-lg border p-3 text-[11px] leading-relaxed text-ink-3" style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel-2)' }}>系統會自動參考：{context.presentationTitle}、{context.previousTitle || '無前一頁'}、{context.nextTitle || '無後一頁'}、目前字型、主題色與內容母片。</div>
          </div>}
          {phase === 'generating' && <div className="py-16 text-center"><div className="mx-auto mb-3 h-2 max-w-md overflow-hidden rounded-full" style={{ background: 'var(--color-panel-2)' }}><div className="h-full transition-all" style={{ width: `${progress?.percent ?? 5}%`, background: 'var(--color-brand)' }} /></div><strong>{progress?.label ?? '準備中'}</strong><p className="mt-2 text-[11.5px] text-ink-3">{progress?.percent ?? 0}%</p></div>}
          {phase === 'preview' && preview && <div className="space-y-4"><SlidePreview slide={preview} /><Field label="重新生成前可補充一句修改要求"><input className="field-input" value={form.extraRequest} placeholder="例如：改成左右比較" onChange={(event) => set('extraRequest', event.target.value)} /></Field></div>}
        </main>
        <footer className="flex items-center gap-2 border-t px-5 py-3" style={{ borderColor: 'var(--color-line)' }}>
          <span role="status" className="mr-auto max-w-[430px] text-[11.5px] text-ink-3">{message}</span>
          {phase === 'settings' && <><button type="button" className="tool-btn" onClick={close}>取消</button><button type="button" className="tool-btn font-bold" style={{ background: 'var(--color-brand)', color: 'var(--color-brand-ink)' }} onClick={() => void generate()}>生成預覽</button></>}
          {phase === 'generating' && <button type="button" className="tool-btn" style={{ color: 'var(--color-danger)' }} onClick={() => fullAiProvider.cancelSingleSlideGeneration()}>停止生成</button>}
          {phase === 'preview' && <><button type="button" className="tool-btn" onClick={close}>取消</button><button type="button" className="tool-btn" onClick={() => setPhase('settings')}>返回修改設定</button><button type="button" className="tool-btn" onClick={() => void generate(true)}>重新生成</button><button type="button" className="tool-btn font-bold" style={{ background: 'var(--color-brand)', color: 'var(--color-brand-ink)' }} onClick={addToDeck}>加入簡報</button></>}
        </footer>
      </div>
    </div>
  );
}
