import { useState } from 'react';
import { auditEditableSlide } from '../ai/editableAudit';
import {
  buildSingleSlidePackage,
  parseHandoffJson,
  SINGLE_SLIDE_PROTOCOL,
  type SingleSlideResult,
} from '../ai/handoffPackage';
import {
  buildSingleSlideContext,
  DEFAULT_SINGLE_SLIDE_FORM,
  validateSingleSlideCandidate,
  validateSingleSlideForm,
} from '../ai/singleSlide';
import type { SingleSlideForm } from '../ai/types';
import { downloadBlob, pickTextFile } from '../lib/files';
import { LAYER } from '../lib/layers';
import { effectiveSlideBackground } from '../model/master';
import type { Slide } from '../model/types';
import { editorStore, useEditorState } from '../store/editorStore';
import { ElementView, sortByZ } from './ElementView';
import { Icon } from './Icon';

type Phase = 'settings' | 'waiting' | 'preview';

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
  return <div className="mx-auto overflow-hidden rounded-lg border shadow-lg" style={{ width: previewWidth, height: height * scale, background: effectiveSlideBackground(state.presentation, slide, 1), borderColor: 'var(--color-line)' }}>
    <div className="relative" style={{ width, height, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
      {sortByZ(master?.elements ?? []).map((element) => <ElementView key={`master-${element.id}`} el={element} mode="present" />)}
      {sortByZ(slide.elements).map((element) => <ElementView key={element.id} el={element} mode="present" />)}
    </div>
  </div>;
}

export function ExternalSingleSlideAiDialog() {
  const state = useEditorState();
  const [context] = useState(() => buildSingleSlideContext(state.presentation, state.currentSlideId, state.selectedSlideIds));
  const [form, setForm] = useState(DEFAULT_SINGLE_SLIDE_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<Phase>('settings');
  const [requestId, setRequestId] = useState('');
  const [preview, setPreview] = useState<Slide | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('新頁會插入選取範圍的最後一頁後面。');
  const set = <K extends keyof SingleSlideForm>(key: K, value: SingleSlideForm[K]) => setForm((current) => ({ ...current, [key]: value }));

  const close = () => busy ? setMessage('正在建立壓縮檔。請稍候再關閉。') : editorStore.closeDialog();

  const exportPackage = async () => {
    if (busy) return;
    const nextErrors = validateSingleSlideForm(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) { setMessage('請先填寫紅色欄位，再下載壓縮檔。'); return; }
    setBusy(true);
    try {
      const pack = await buildSingleSlidePackage(form, context, state.presentation);
      downloadBlob(pack.blob, pack.filename);
      setRequestId(pack.requestId);
      setPhase('waiting');
      setMessage('壓縮檔已下載。把整包交給 AI，再匯入 single-slide-result.json。');
    } catch (error) { setMessage(error instanceof Error ? error.message : '壓縮檔建立失敗。請再試一次。'); }
    finally { setBusy(false); }
  };

  const importResult = async () => {
    const file = await pickTextFile('.json,application/json');
    if (!file) return;
    try {
      const result = parseHandoffJson<SingleSlideResult>(file.text, SINGLE_SLIDE_PROTOCOL, requestId);
      if (result.sourcePresentationId !== context.presentationId || result.insertAfterSlideId !== context.insertAfterSlideId) throw new Error('單頁結果不屬於這次插入位置。請使用剛才壓縮檔產生的結果。');
      const validation = validateSingleSlideCandidate(result.slide, context);
      const audit = auditEditableSlide(result.slide, context.width, context.height);
      const issue = validation.errors[0] ?? audit.issues[0];
      if (!validation.ok || audit.issues.length) throw new Error(`${issue} 請請 AI 修正後，再匯入一次。`);
      setPreview(result.slide);
      setPhase('preview');
      setMessage(`結果已通過檢查。原生元件 ${audit.nativeCount} 個，SVG ${audit.svgCount} 個，圖片 ${audit.imageCount} 個。`);
    } catch (error) { setMessage(error instanceof Error ? error.message : '單頁結果匯入失敗。請檢查檔案。'); }
  };

  const addToDeck = () => {
    if (!preview || !editorStore.insertGeneratedSlide(preview, context)) return;
    editorStore.closeDialog();
    editorStore.toast({ tone: 'success', title: '外部 AI 單頁已加入簡報', detail: '按一次復原會移除整張，重作會完整恢復。' });
  };

  return <div className="fixed inset-0 flex items-center justify-center bg-black/50 p-5" style={{ zIndex: LAYER.dialog }} onClick={close}>
    <div className="panel-card aps-fade-in flex max-h-[92vh] w-full max-w-[820px] flex-col overflow-hidden shadow-2xl" onClick={(event) => event.stopPropagation()}>
      <header className="flex items-start justify-between border-b px-5 py-4" style={{ borderColor: 'var(--color-line)' }}><div><h2 className="text-[16px] font-bold">AI 生成單頁</h2><p className="mt-1 text-[11.5px] text-ink-3">下載壓縮檔交給外部 AI。匯入預覽前不會改動簡報。</p></div><button type="button" className="tool-btn px-2" aria-label="關閉 AI 生成單頁" onClick={close}><Icon name="close" size={15} /></button></header>
      <main className="min-h-0 flex-1 overflow-y-auto p-5">
        {phase === 'settings' && <div className="space-y-3">
          <Field label="本頁主題" required error={errors.topic}><input autoFocus className="field-input" value={form.topic} onChange={(event) => set('topic', event.target.value)} /></Field>
          <Field label="本頁要表達的重點" required error={errors.keyMessage}><textarea className="field-input min-h-20" value={form.keyMessage} onChange={(event) => set('keyMessage', event.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="頁面類型"><select className="field-input" value={form.pageType} onChange={(event) => set('pageType', event.target.value as SingleSlideForm['pageType'])}>{PAGE_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="視覺風格"><select className="field-input" value={form.visualStyle} onChange={(event) => set('visualStyle', event.target.value as SingleSlideForm['visualStyle'])}>{VISUAL_STYLES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field></div>
          <Field label="資料或參考內容"><textarea className="field-input min-h-16" value={form.referenceContent} onChange={(event) => set('referenceContent', event.target.value)} /></Field>
          <Field label="補充要求"><input className="field-input" placeholder="例如：文字再少一點" value={form.extraRequest} onChange={(event) => set('extraRequest', event.target.value)} /></Field>
          <label className="flex items-center gap-2 text-[11.5px] text-ink-2"><input type="checkbox" checked={form.generateNotes} onChange={(event) => set('generateNotes', event.target.checked)} />產生講者備註</label>
          <div className="rounded-lg border p-3 text-[11px] leading-relaxed text-ink-3" style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel-2)' }}>壓縮檔會包含整份簡報、內容母片、前後頁摘要、目前字型與主題色。</div>
        </div>}
        {phase === 'waiting' && <div className="mx-auto max-w-2xl space-y-3 py-12"><h3 className="text-[18px] font-bold">等待單頁 AI 結果</h3><ol className="list-decimal space-y-2 pl-5 text-[12px] leading-relaxed"><li>找到下載的 <strong>single-slide-ai-package.zip</strong>。</li><li>把整個壓縮檔上傳給 ChatGPT、Claude、Gemini 或其他 AI。</li><li>請 AI 先讀取壓縮檔內的 AI-INSTRUCTIONS.md。</li><li>下載 AI 回傳的 <strong>single-slide-result.json</strong>。</li><li>回到這裡按「匯入 AI 單頁結果」。</li></ol></div>}
        {phase === 'preview' && preview && <div className="space-y-4"><SlidePreview slide={preview} /><Field label="要修改時，可補充要求後重新下載"><input className="field-input" value={form.extraRequest} onChange={(event) => set('extraRequest', event.target.value)} /></Field></div>}
      </main>
      <footer className="flex items-center gap-2 border-t px-5 py-3" style={{ borderColor: 'var(--color-line)' }}><span role="status" className="mr-auto max-w-[430px] text-[11.5px] text-ink-3">{message}</span>
        {phase === 'settings' && <><button type="button" className="tool-btn" onClick={close}>取消</button><button type="button" className="tool-btn font-bold" disabled={busy} onClick={() => void exportPackage()}>下載單頁 AI 壓縮檔</button></>}
        {phase === 'waiting' && <><button type="button" className="tool-btn" onClick={() => setPhase('settings')}>返回修改設定</button><button type="button" className="tool-btn font-bold" onClick={() => void importResult()}>匯入 AI 單頁結果</button></>}
        {phase === 'preview' && <><button type="button" className="tool-btn" onClick={close}>取消</button><button type="button" className="tool-btn" onClick={() => setPhase('settings')}>返回修改設定</button><button type="button" className="tool-btn" disabled={busy} onClick={() => void exportPackage()}>重新下載給 AI</button><button type="button" className="tool-btn font-bold" onClick={addToDeck}>加入簡報</button></>}
      </footer>
    </div>
  </div>;
}
