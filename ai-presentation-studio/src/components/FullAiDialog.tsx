import { useMemo, useState } from 'react';
import { DEFAULT_FULL_AI_FORM, QUICK_PRESETS, applyQuickPreset, validateFullAiForm } from '../ai/form';
import { fullAiProvider } from '../ai/mockProvider';
import { auditEditablePresentation } from '../ai/editableAudit';
import {
  addOutlineSlide,
  deleteOutlineSlide,
  isPresentationOutline,
  moveOutlineSlide,
  updateOutlineSlide,
} from '../ai/outline';
import type {
  FullAiForm,
  GeneratedDeckAction,
  GenerationSlideStatus,
  OutlineSlide,
  PresentationOutline,
} from '../ai/types';
import { LAYER } from '../lib/layers';
import type { Presentation } from '../model/types';
import { validatePresentation } from '../model/validator';
import { editorStore, useEditorState } from '../store/editorStore';
import { Icon } from './Icon';

type Phase = 'settings' | 'outline' | 'generating' | 'result';

const STATUS_LABEL: Record<GenerationSlideStatus, string> = {
  waiting: '等待', generating: '生成中', success: '成功', failed: '失敗', stopped: '已停止',
};

function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <label className="block text-[11.5px] text-ink-2">
      <span className="mb-1 block font-bold">{label}{required && <span style={{ color: 'var(--color-danger)' }}> *</span>}</span>
      {children}
      {error && <span className="mt-1 block" style={{ color: 'var(--color-danger)' }}>{error}</span>}
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="flex items-center gap-2 text-[11.5px] text-ink-2"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />{label}</label>;
}

export function SettingsForm({ form, errors, onChange }: { form: FullAiForm; errors: Record<string, string>; onChange: (next: FullAiForm) => void }) {
  const set = <K extends keyof FullAiForm>(key: K, value: FullAiForm[K]) => onChange({ ...form, [key]: value });
  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-2 text-[12px] font-bold">快速設定</h3>
        <div className="grid grid-cols-3 gap-2">
          {QUICK_PRESETS.map((preset) => <button key={preset.id} type="button" className="tool-btn justify-center" onClick={() => onChange(applyQuickPreset(form, preset.id))}>{preset.name}</button>)}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="border-b pb-2 text-[12px] font-bold" style={{ borderColor: 'var(--color-line)' }}>基本資訊</h3>
        <Field label="簡報主題" required error={errors.topic}><input className="field-input" value={form.topic} onChange={(e) => set('topic', e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="簡報目的" required error={errors.purpose}><input className="field-input" value={form.purpose} onChange={(e) => set('purpose', e.target.value)} /></Field>
          <Field label="目標觀眾" required error={errors.audience}><input className="field-input" value={form.audience} onChange={(e) => set('audience', e.target.value)} /></Field>
          <Field label="投影片數量" error={errors.slideCount}><input className="field-input" type="number" min={3} max={30} value={form.slideCount} onChange={(e) => set('slideCount', Number(e.target.value))} /></Field>
          <Field label="簡報語言"><input className="field-input" value={form.language} onChange={(e) => set('language', e.target.value)} /></Field>
          <Field label="簡報比例"><select className="field-input" value={form.aspectRatio} onChange={(e) => set('aspectRatio', e.target.value as FullAiForm['aspectRatio'])}><option value="16:9">16:9</option><option value="4:3">4:3</option></select></Field>
          <Field label="預計演講時間（分鐘）" error={errors.durationMinutes}><input className="field-input" type="number" min={1} max={300} value={form.durationMinutes} onChange={(e) => set('durationMinutes', Number(e.target.value))} /></Field>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="border-b pb-2 text-[12px] font-bold" style={{ borderColor: 'var(--color-line)' }}>內容設定</h3>
        <Field label="背景資料"><textarea className="field-input min-h-20" value={form.backgroundInfo} onChange={(e) => set('backgroundInfo', e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="必須包含的內容"><textarea className="field-input min-h-16" value={form.requiredContent} onChange={(e) => set('requiredContent', e.target.value)} /></Field>
          <Field label="不要出現的內容"><textarea className="field-input min-h-16" value={form.excludedContent} onChange={(e) => set('excludedContent', e.target.value)} /></Field>
          <Field label="參考網址"><textarea className="field-input min-h-16" value={form.referenceUrls} onChange={(e) => set('referenceUrls', e.target.value)} /></Field>
          <Field label="數據與資料來源"><textarea className="field-input min-h-16" value={form.dataSources} onChange={(e) => set('dataSources', e.target.value)} /></Field>
          <Field label="每頁文字量"><select className="field-input" value={form.textDensity} onChange={(e) => set('textDensity', e.target.value as FullAiForm['textDensity'])}><option value="concise">精簡</option><option value="normal">一般</option><option value="detailed">詳細</option></select></Field>
          <Field label="內容語氣"><select className="field-input" value={form.tone} onChange={(e) => set('tone', e.target.value as FullAiForm['tone'])}><option value="professional">專業</option><option value="teaching">教學</option><option value="sales">銷售</option><option value="story">故事</option><option value="formal">正式</option></select></Field>
        </div>
        <Toggle label="產生講者備註" checked={form.generateNotes} onChange={(value) => set('generateNotes', value)} />
      </section>

      <section className="space-y-3">
        <h3 className="border-b pb-2 text-[12px] font-bold" style={{ borderColor: 'var(--color-line)' }}>視覺設定</h3>
        <div className="grid grid-cols-3 gap-3">
          <Field label="視覺風格"><input className="field-input" value={form.visualStyle} onChange={(e) => set('visualStyle', e.target.value)} /></Field>
          <Field label="主要顏色" error={errors.primaryColor}><input className="field-input" value={form.primaryColor} onChange={(e) => set('primaryColor', e.target.value)} /></Field>
          <Field label="輔助顏色" error={errors.secondaryColor}><input className="field-input" value={form.secondaryColor} onChange={(e) => set('secondaryColor', e.target.value)} /></Field>
          <Field label="封面母片"><select className="field-input" value={form.coverMaster} onChange={(e) => set('coverMaster', e.target.value as FullAiForm['coverMaster'])}><option value="minimal">簡約封面</option><option value="bold">強調封面</option></select></Field>
          <Field label="內容母片"><select className="field-input" value={form.contentMaster} onChange={(e) => set('contentMaster', e.target.value as FullAiForm['contentMaster'])}><option value="standard">標準內容</option><option value="card">卡片內容</option></select></Field>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Toggle label="使用圖表" checked={form.useCharts} onChange={(value) => set('useCharts', value)} />
          <Toggle label="使用時間軸" checked={form.useTimelines} onChange={(value) => set('useTimelines', value)} />
          <Toggle label="使用流程圖" checked={form.useFlowcharts} onChange={(value) => set('useFlowcharts', value)} />
          <Toggle label="使用圖片" checked={form.useImages} onChange={(value) => set('useImages', value)} />
          <Toggle label="顯示頁碼" checked={form.showSlideNumbers} onChange={(value) => set('showSlideNumbers', value)} />
        </div>
      </section>
    </div>
  );
}

export function OutlineEditor({ outline, busyId, onChange, onRegenerate, showRegenerate = true }: { outline: PresentationOutline; busyId: string | null; onChange: (outline: PresentationOutline) => void; onRegenerate: (slide: OutlineSlide, index: number) => void; showRegenerate?: boolean }) {
  const [dragId, setDragId] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="簡報標題"><input className="field-input" value={outline.title} onChange={(e) => onChange({ ...outline, title: e.target.value })} /></Field>
        <Field label="簡報副標題"><input className="field-input" value={outline.subtitle} onChange={(e) => onChange({ ...outline, subtitle: e.target.value })} /></Field>
      </div>
      <div className="space-y-2">
        {outline.slides.map((slide, index) => (
          <article key={slide.id} draggable onDragStart={() => setDragId(slide.id)} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (dragId) onChange({ ...outline, slides: moveOutlineSlide(outline.slides, dragId, slide.id) }); setDragId(null); }} className="rounded-xl border p-3" style={{ borderColor: slide.locked ? 'var(--color-brand)' : 'var(--color-line)', background: 'var(--color-panel-2)' }}>
            <div className="mb-2 flex items-center gap-2">
              <span className="cursor-grab text-ink-3" title="拖曳調整順序">⋮⋮</span>
              <strong className="text-[12px]">第 {index + 1} 頁</strong>
              <span className="flex-1 text-[10.5px] text-ink-3">{slide.visualSuggestion}</span>
              <button type="button" className="tool-btn px-2" onClick={() => onChange(updateOutlineSlide(outline, slide.id, { locked: !slide.locked }))}>{slide.locked ? '解除鎖定' : '鎖定'}</button>
              {showRegenerate && <button type="button" className="tool-btn px-2" disabled={slide.locked || busyId === slide.id} onClick={() => onRegenerate(slide, index)}>{busyId === slide.id ? '產生中…' : '重新產生'}</button>}
              <button type="button" className="tool-btn px-2" disabled={outline.slides.length <= 1} onClick={() => onChange(deleteOutlineSlide(outline, slide.id))}>刪除</button>
            </div>
            <div className="grid grid-cols-[1fr_160px] gap-2">
              <input aria-label={`第 ${index + 1} 頁標題`} className="field-input" value={slide.title} onChange={(e) => onChange(updateOutlineSlide(outline, slide.id, { title: e.target.value }))} />
              <select aria-label={`第 ${index + 1} 頁版型`} className="field-input" value={slide.layoutId} onChange={(e) => onChange(updateOutlineSlide(outline, slide.id, { layoutId: e.target.value as OutlineSlide['layoutId'] }))}><option value="title">標題頁</option><option value="title-content">標題加內容</option><option value="two-column">兩欄</option><option value="image-text">圖文</option></select>
            </div>
            <textarea aria-label={`第 ${index + 1} 頁內容摘要`} className="field-input mt-2 min-h-16" value={slide.summary} onChange={(e) => onChange(updateOutlineSlide(outline, slide.id, { summary: e.target.value }))} />
            <input aria-label={`第 ${index + 1} 頁講者備註摘要`} className="field-input mt-2" value={slide.notesSummary} onChange={(e) => onChange(updateOutlineSlide(outline, slide.id, { notesSummary: e.target.value }))} />
          </article>
        ))}
      </div>
      <button type="button" className="tool-btn w-full justify-center" onClick={() => onChange(addOutlineSlide(outline))}><Icon name="plus" size={14} />新增投影片</button>
    </div>
  );
}

export function FullAiDialog() {
  const state = useEditorState();
  const [phase, setPhase] = useState<Phase>('settings');
  const [form, setForm] = useState(DEFAULT_FULL_AI_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [outline, setOutline] = useState<PresentationOutline | null>(null);
  const [generated, setGenerated] = useState<Presentation | null>(null);
  const [statuses, setStatuses] = useState<Record<string, { status: GenerationSlideStatus; message?: string }>>({});
  const [message, setMessage] = useState('');
  const [busyOutlineId, setBusyOutlineId] = useState<string | null>(null);
  const [generatingOutline, setGeneratingOutline] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);

  const busy = phase === 'generating' || busyOutlineId !== null || generatingOutline;
  const statusList = outline?.slides.map((slide) => statuses[slide.id]?.status ?? 'waiting') ?? [];
  const doneCount = statusList.filter((status) => status === 'success' || status === 'failed').length;
  const failedIds = outline?.slides.filter((slide) => statuses[slide.id]?.status === 'failed').map((slide) => slide.id) ?? [];
  const currentTitle = outline?.slides.find((slide) => statuses[slide.id]?.status === 'generating')?.title;
  const percent = outline?.slides.length ? Math.round(doneCount / outline.slides.length * 100) : 0;
  const canClose = !busy;

  const close = () => {
    if (!canClose) {
      setMessage('生成進行中。請先按「停止生成」，再關閉視窗。');
      return;
    }
    editorStore.closeDialog();
  };

  const generateOutline = async () => {
    if (generatingOutline) return;
    const nextErrors = validateFullAiForm(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setMessage('請先修正紅色欄位，再產生大綱。');
      return;
    }
    setMessage('正在整理大綱…');
    setGeneratingOutline(true);
    try {
      const next = await fullAiProvider.generateOutline(form);
      if (!isPresentationOutline(next) || next.slides.length !== form.slideCount) throw new Error('AI 回傳的大綱格式不正確。請重新產生大綱。');
      setOutline(next);
      setPhase('outline');
      setMessage('大綱已產生。請先修改並確認，再生成完整簡報。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '大綱產生失敗。請再試一次。');
    } finally {
      setGeneratingOutline(false);
    }
  };

  const regenerateOutlineSlide = async (slide: OutlineSlide, index: number) => {
    if (slide.locked || !outline || busyOutlineId) return;
    setBusyOutlineId(slide.id);
    try {
      const next = await fullAiProvider.regenerateSlide(form, slide, index);
      setOutline(updateOutlineSlide(outline, slide.id, next));
      setMessage(`第 ${index + 1} 頁大綱已重新產生。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '單張大綱產生失敗。請再試一次。');
    } finally {
      setBusyOutlineId(null);
    }
  };

  const runFullGeneration = async () => {
    if (!outline || busy) return;
    setPhase('generating');
    setGenerated(null);
    setMessage('開始生成完整簡報。');
    setStatuses(Object.fromEntries(outline.slides.map((slide) => [slide.id, { status: 'waiting' }])));
    const failedDuringRun = new Set<string>();
    try {
      const next = await fullAiProvider.generatePresentation(form, outline, (progress) => {
        if (progress.status === 'failed') failedDuringRun.add(progress.slideId);
        setStatuses((current) => ({ ...current, [progress.slideId]: { status: progress.status, message: progress.message } }));
      });
      const report = validatePresentation(next);
      if (report.status === 'error') throw new Error(`AI 回傳的簡報格式錯誤：${report.issues[0]?.message ?? '請重新生成。'}`);
      const editableReport = auditEditablePresentation(next);
      if (!editableReport.ok) throw new Error(`AI 結果不能完整編輯：${editableReport.issues[0]}請重新生成。`);
      setGenerated(next);
      setPhase('result');
      setMessage(failedDuringRun.size ? '部分頁面失敗。請重新生成失敗頁面。' : '完整簡報已生成。請選擇放置方式。');
    } catch (error) {
      const stopped = error instanceof DOMException && error.name === 'AbortError';
      setStatuses((current) => Object.fromEntries(Object.entries(current).map(([id, value]) => [id, value.status === 'success' ? value : { status: stopped ? 'stopped' : 'failed', message: stopped ? '使用者已停止生成。' : '生成失敗，請重新嘗試。' }])));
      setPhase(stopped ? 'outline' : 'result');
      setMessage(error instanceof Error ? error.message : '全部生成失敗。請調整設定後再試一次。');
    }
  };

  const retryFailed = async () => {
    if (!outline || failedIds.length === 0 || busy) return;
    const failedSlides = outline.slides.filter((slide) => failedIds.includes(slide.id));
    setPhase('generating');
    try {
      const partial = await fullAiProvider.generatePresentation(form, { ...outline, slides: failedSlides }, (progress) => setStatuses((current) => ({ ...current, [progress.slideId]: { status: progress.status, message: progress.message } })));
      if (!generated) setGenerated(partial);
      else {
        const next = structuredClone(generated);
        failedSlides.forEach((slide, partialIndex) => {
          const originalIndex = outline.slides.findIndex((item) => item.id === slide.id);
          if (partial.slides[partialIndex] && originalIndex >= 0) next.slides[originalIndex] = partial.slides[partialIndex];
        });
        setGenerated(next);
      }
      setPhase('result');
      setMessage('失敗頁面已重新生成。');
    } catch (error) {
      setPhase('result');
      setMessage(error instanceof Error ? error.message : '重新生成失敗頁面時發生錯誤。請再試一次。');
    }
  };

  const applyResult = (action: GeneratedDeckAction) => {
    if (!generated) return;
    if (action === 'replace' && !confirmReplace) { setConfirmReplace(true); return; }
    editorStore.applyGeneratedPresentation(generated, action);
    editorStore.closeDialog();
    editorStore.toast({ tone: 'success', title: action === 'append' ? 'AI 簡報已加到目前簡報後面' : action === 'replace' ? '目前簡報已由 AI 簡報取代' : '已建立新的 AI 簡報', detail: '可以按復原還原整次操作。' });
  };

  const resultReport = useMemo(() => generated ? validatePresentation(generated) : null, [generated]);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/50 p-5" style={{ zIndex: LAYER.dialog }} onClick={close}>
      <div className="panel-card aps-fade-in flex max-h-[94vh] w-full max-w-[1080px] flex-col overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-start justify-between gap-4 border-b px-5 py-4" style={{ borderColor: 'var(--color-line)' }}>
          <div><h2 className="text-[16px] font-bold">全 AI 生成</h2><p className="mt-1 text-[11.5px] text-ink-3">目前使用 Mock AI。所有內容都在本機產生，不會送到外部。</p></div>
          <button type="button" className="tool-btn px-2" aria-label="關閉全 AI 生成" onClick={close}><Icon name="close" size={15} /></button>
        </header>
        <div className="flex items-center gap-2 border-b px-5 py-2 text-[11px]" style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel-2)' }}>
          {(['settings', 'outline', 'generating', 'result'] as Phase[]).map((item, index) => <span key={item} className="rounded-full px-2.5 py-1 font-bold" style={{ background: phase === item ? 'var(--color-brand)' : 'var(--color-panel)', color: phase === item ? 'var(--color-brand-ink)' : 'var(--color-ink-3)' }}>{index + 1}. {item === 'settings' ? '設定' : item === 'outline' ? '大綱' : item === 'generating' ? '生成' : '完成'}</span>)}
          <span className="ml-auto">Provider：{fullAiProvider.name}</span>
        </div>
        <main className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {state.dirty && phase === 'settings' && <div className="mb-4 rounded-lg border px-3 py-2 text-[11.5px]" style={{ borderColor: 'var(--color-warn)', background: 'var(--color-warn-soft)' }}>目前簡報還沒儲存。選擇「建立成新簡報」時，系統會先儲存目前簡報。</div>}
          {phase === 'settings' && <SettingsForm form={form} errors={errors} onChange={setForm} />}
          {phase === 'outline' && outline && <OutlineEditor outline={outline} busyId={busyOutlineId} onChange={setOutline} onRegenerate={regenerateOutlineSlide} />}
          {phase === 'generating' && outline && <div className="space-y-4"><div><div className="mb-1 flex justify-between text-[12px]"><strong>整體進度 {percent}%</strong><span>{doneCount} / {outline.slides.length}</span></div><div className="h-2 overflow-hidden rounded-full" style={{ background: 'var(--color-panel-2)' }}><div className="h-full" style={{ width: `${percent}%`, background: 'var(--color-brand)' }} /></div></div>{currentTitle && <p className="text-[12px]">正在處理：{currentTitle}</p>}<div className="space-y-1">{outline.slides.map((slide, index) => { const info = statuses[slide.id] ?? { status: 'waiting' as const }; return <div key={slide.id} className="flex items-center gap-3 rounded-lg px-3 py-2 text-[11.5px]" style={{ background: 'var(--color-panel-2)' }}><span className="w-8">{index + 1}</span><span className="flex-1">{slide.title}</span><strong>{STATUS_LABEL[info.status]}</strong>{info.message && <span style={{ color: 'var(--color-danger)' }}>{info.message}</span>}</div>; })}</div></div>}
          {phase === 'result' && <div className="space-y-4"><div className="rounded-xl border p-4" style={{ borderColor: resultReport?.status === 'error' ? 'var(--color-danger)' : 'var(--color-ok)' }}><h3 className="font-bold">{generated ? '生成完成' : '生成失敗'}</h3><p className="mt-1 text-[11.5px] text-ink-3">{generated ? `${generated.slides.length} 張投影片，驗證結果：${resultReport?.status === 'success' ? '通過' : '有提醒'}` : '沒有可套用的簡報。請返回大綱後重新生成。'}</p></div>{failedIds.length > 0 && <button type="button" className="tool-btn" onClick={() => void retryFailed()}>重新生成失敗頁面</button>}{generated && <div><h3 className="mb-2 text-[12px] font-bold">選擇生成結果要放在哪裡</h3><div className="grid grid-cols-3 gap-3"><button type="button" className="tool-btn justify-center py-3" onClick={() => applyResult('new')}>建立成新簡報</button><button type="button" className="tool-btn justify-center py-3" onClick={() => applyResult('append')}>加到目前簡報後面</button><button type="button" className="tool-btn justify-center py-3" style={{ color: 'var(--color-danger)' }} onClick={() => applyResult('replace')}>取代目前簡報</button></div></div>}{confirmReplace && <div className="rounded-xl border p-4" style={{ borderColor: 'var(--color-danger)', background: 'var(--color-danger-soft)' }}><strong className="text-[12px]">確定取代目前簡報？</strong><p className="my-2 text-[11.5px]">目前內容會被生成結果取代。完成後仍可按復原。</p><div className="flex gap-2"><button type="button" className="tool-btn" onClick={() => setConfirmReplace(false)}>取消</button><button type="button" className="tool-btn" style={{ background: 'var(--color-danger)', color: 'white' }} onClick={() => applyResult('replace')}>確定取代</button></div></div>}</div>}
        </main>
        <footer className="flex items-center gap-3 border-t px-5 py-3" style={{ borderColor: 'var(--color-line)' }}><span role="status" className="min-w-0 flex-1 text-[11.5px] text-ink-3">{message}</span>{phase === 'settings' && <button type="button" className="tool-btn" style={{ background: 'var(--color-brand)', color: 'var(--color-brand-ink)' }} disabled={generatingOutline} onClick={() => void generateOutline()}>{generatingOutline ? '產生中…' : '產生大綱'}</button>}{phase === 'outline' && <><button type="button" className="tool-btn" onClick={() => setPhase('settings')}>返回設定</button><button type="button" className="tool-btn" style={{ background: 'var(--color-brand)', color: 'var(--color-brand-ink)' }} disabled={busy} onClick={() => void runFullGeneration()}>生成完整簡報</button></>}{phase === 'generating' && <button type="button" className="tool-btn" style={{ color: 'var(--color-danger)' }} onClick={() => fullAiProvider.cancel()}>停止生成</button>}{phase === 'result' && <button type="button" className="tool-btn" onClick={() => setPhase('outline')}>返回大綱</button>}</footer>
      </div>
    </div>
  );
}
