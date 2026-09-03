import { useState } from 'react';
import { QUICK_PRESETS, applyQuickPreset } from '../ai/form';
import { addOutlineSlide, deleteOutlineSlide, moveOutlineSlide, updateOutlineSlide } from '../ai/outline';
import type { FullAiForm, OutlineSlide, PresentationOutline } from '../ai/types';
import { Icon } from './Icon';

/**
 * 全 AI 生成共用的表單元件。
 *
 * 只負責畫面與本地狀態，不知道結果最後是怎麼生成的，
 * 所以「全 AI 生成」的外部交接對話框可以直接重用，不用重寫一份表單。
 */

export function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <label className="block text-[11.5px] text-ink-2">
      <span className="mb-1 block font-bold">{label}{required && <span style={{ color: 'var(--color-danger)' }}> *</span>}</span>
      {children}
      {error && <span className="mt-1 block" style={{ color: 'var(--color-danger)' }}>{error}</span>}
    </label>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
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
