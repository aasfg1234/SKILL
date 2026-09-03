import { useState } from 'react';
import { auditEditablePresentation } from '../ai/editableAudit';
import { DEFAULT_FULL_AI_FORM, validateFullAiForm } from '../ai/form';
import {
  buildFullOutlinePackage,
  buildFullPresentationPackage,
  FULL_OUTLINE_PROTOCOL,
  FULL_PRESENTATION_PROTOCOL,
  parseHandoffJson,
  type FullOutlineResult,
  type FullPresentationResult,
} from '../ai/handoffPackage';
import { isPresentationOutline } from '../ai/outline';
import type { FullAiForm, GeneratedDeckAction, PresentationOutline } from '../ai/types';
import { downloadBlob, pickTextFile } from '../lib/files';
import { LAYER } from '../lib/layers';
import type { Presentation } from '../model/types';
import { validatePresentation } from '../model/validator';
import { editorStore, useEditorState } from '../store/editorStore';
import { Icon } from './Icon';
import { OutlineEditor, SettingsForm } from './FullAiDialog';

type Phase = 'settings' | 'outline-waiting' | 'outline' | 'presentation-waiting' | 'result';

export function ExternalFullAiDialog() {
  const state = useEditorState();
  const [phase, setPhase] = useState<Phase>('settings');
  const [form, setForm] = useState<FullAiForm>(DEFAULT_FULL_AI_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [outline, setOutline] = useState<PresentationOutline | null>(null);
  const [generated, setGenerated] = useState<Presentation | null>(null);
  const [outlineRequestId, setOutlineRequestId] = useState('');
  const [presentationRequestId, setPresentationRequestId] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [message, setMessage] = useState('先填寫設定，再下載大綱 AI 壓縮檔。');

  const close = () => busy ? setMessage('正在建立壓縮檔。請稍候再關閉。') : editorStore.closeDialog();

  const exportOutlinePackage = async () => {
    if (busy) return;
    const nextErrors = validateFullAiForm(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) { setMessage('請先修正紅色欄位。'); return; }
    setBusy(true);
    try {
      const pack = await buildFullOutlinePackage(form, state.presentation);
      downloadBlob(pack.blob, pack.filename);
      setOutlineRequestId(pack.requestId);
      setPhase('outline-waiting');
      setMessage('壓縮檔已下載。把整包交給 AI，再匯入 full-ai-outline-result.json。');
    } catch (error) { setMessage(error instanceof Error ? error.message : '壓縮檔建立失敗。請再試一次。'); }
    finally { setBusy(false); }
  };

  const importOutline = async () => {
    const file = await pickTextFile('.json,application/json');
    if (!file) return;
    try {
      const result = parseHandoffJson<FullOutlineResult>(file.text, FULL_OUTLINE_PROTOCOL, outlineRequestId);
      if (result.sourcePresentationId !== state.presentation.metadata.id) throw new Error('大綱結果不屬於目前簡報。請重新匯出壓縮檔。');
      if (!isPresentationOutline(result.outline) || result.outline.slides.length !== form.slideCount) throw new Error(`大綱格式不正確，投影片必須是 ${form.slideCount} 張。請請 AI 重新產生。`);
      setOutline(result.outline);
      setPhase('outline');
      setMessage('大綱已匯入。修改確認後，再下載完整簡報 AI 壓縮檔。');
    } catch (error) { setMessage(error instanceof Error ? error.message : '大綱匯入失敗。請檢查檔案。'); }
  };

  const exportPresentationPackage = async () => {
    if (!outline || busy) return;
    setBusy(true);
    try {
      const pack = await buildFullPresentationPackage(form, outline, state.presentation);
      downloadBlob(pack.blob, pack.filename);
      setPresentationRequestId(pack.requestId);
      setPhase('presentation-waiting');
      setMessage('壓縮檔已下載。把整包交給 AI，再匯入 full-ai-presentation-result.json。');
    } catch (error) { setMessage(error instanceof Error ? error.message : '壓縮檔建立失敗。請再試一次。'); }
    finally { setBusy(false); }
  };

  const importPresentation = async () => {
    const file = await pickTextFile('.json,application/json');
    if (!file) return;
    try {
      const result = parseHandoffJson<FullPresentationResult>(file.text, FULL_PRESENTATION_PROTOCOL, presentationRequestId);
      if (result.sourcePresentationId !== state.presentation.metadata.id) throw new Error('生成結果不屬於目前簡報。請重新匯出壓縮檔。');
      const report = validatePresentation(result.presentation);
      if (report.status === 'error') throw new Error(`簡報格式錯誤：${report.issues[0]?.message ?? '請請 AI 重新產生。'}`);
      const audit = auditEditablePresentation(result.presentation);
      if (!audit.ok) throw new Error(`簡報不能完整編輯：${audit.issues[0]}`);
      setGenerated(result.presentation);
      setPhase('result');
      setMessage(`已通過檢查。原生元件 ${audit.nativeCount} 個，SVG ${audit.svgCount} 個，圖片 ${audit.imageCount} 個。`);
    } catch (error) { setMessage(error instanceof Error ? error.message : '完整簡報匯入失敗。請檢查檔案。'); }
  };

  const applyResult = (action: GeneratedDeckAction) => {
    if (!generated) return;
    if (action === 'replace' && !confirmReplace) { setConfirmReplace(true); return; }
    editorStore.applyGeneratedPresentation(generated, action);
    editorStore.closeDialog();
    editorStore.toast({ tone: 'success', title: action === 'append' ? '外部 AI 簡報已加到後面' : action === 'replace' ? '目前簡報已取代' : '已建立新簡報', detail: '整次套用可用復原還原。' });
  };

  const step = phase === 'settings' || phase === 'outline-waiting' ? 1 : phase === 'outline' || phase === 'presentation-waiting' ? 2 : 3;

  return <div className="fixed inset-0 flex items-center justify-center bg-black/50 p-5" style={{ zIndex: LAYER.dialog }} onClick={close}>
    <div className="panel-card aps-fade-in flex max-h-[94vh] w-full max-w-[1080px] flex-col overflow-hidden shadow-2xl" onClick={(event) => event.stopPropagation()}>
      <header className="flex items-start justify-between border-b px-5 py-4" style={{ borderColor: 'var(--color-line)' }}><div><h2 className="text-[16px] font-bold">全 AI 生成</h2><p className="mt-1 text-[11.5px] text-ink-3">下載壓縮檔交給外部 AI，編輯器不會直接產生內容。</p></div><button type="button" className="tool-btn px-2" aria-label="關閉全 AI 生成" onClick={close}><Icon name="close" size={15} /></button></header>
      <div className="flex gap-2 border-b px-5 py-2 text-[11px]" style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel-2)' }}>{['1. 大綱交接', '2. 完整簡報交接', '3. 套用結果'].map((label, index) => <span key={label} className="rounded-full px-2.5 py-1 font-bold" style={{ background: step === index + 1 ? 'var(--color-brand)' : 'var(--color-panel)', color: step === index + 1 ? 'var(--color-brand-ink)' : 'var(--color-ink-3)' }}>{label}</span>)}</div>
      <main className="min-h-0 flex-1 overflow-y-auto p-5">
        {phase === 'settings' && <SettingsForm form={form} errors={errors} onChange={setForm} />}
        {phase === 'outline-waiting' && <Waiting title="等待大綱結果" file="full-ai-outline-package.zip" result="full-ai-outline-result.json" />}
        {phase === 'outline' && outline && <OutlineEditor outline={outline} busyId={null} onChange={setOutline} onRegenerate={() => undefined} showRegenerate={false} />}
        {phase === 'presentation-waiting' && <Waiting title="等待完整簡報" file="full-ai-presentation-package.zip" result="full-ai-presentation-result.json" />}
        {phase === 'result' && generated && <div className="space-y-4"><div className="rounded-xl border p-4" style={{ borderColor: 'var(--color-ok)' }}><strong>外部 AI 結果已通過檢查</strong><p className="mt-1 text-[11.5px] text-ink-3">{generated.slides.length} 張投影片。套用前不會改動目前簡報。</p></div><div className="grid grid-cols-3 gap-3"><button className="tool-btn justify-center py-3" onClick={() => applyResult('new')}>建立成新簡報</button><button className="tool-btn justify-center py-3" onClick={() => applyResult('append')}>加到目前簡報後面</button><button className="tool-btn justify-center py-3" style={{ color: 'var(--color-danger)' }} onClick={() => applyResult('replace')}>取代目前簡報</button></div>{confirmReplace && <div className="rounded-xl border p-4" style={{ borderColor: 'var(--color-danger)' }}><p>確定取代目前簡報？完成後仍可復原。</p><button className="tool-btn mt-2" onClick={() => applyResult('replace')}>確定取代</button></div>}</div>}
      </main>
      <footer className="flex items-center gap-2 border-t px-5 py-3" style={{ borderColor: 'var(--color-line)' }}><span role="status" className="mr-auto max-w-[560px] text-[11.5px] text-ink-3">{message}</span>{phase === 'settings' && <button className="tool-btn font-bold" disabled={busy} onClick={() => void exportOutlinePackage()}>下載大綱 AI 壓縮檔</button>}{phase === 'outline-waiting' && <><button className="tool-btn" onClick={() => setPhase('settings')}>返回設定</button><button className="tool-btn font-bold" onClick={() => void importOutline()}>匯入 AI 大綱結果</button></>}{phase === 'outline' && <><button className="tool-btn" onClick={() => setPhase('settings')}>返回設定</button><button className="tool-btn font-bold" disabled={busy} onClick={() => void exportPresentationPackage()}>下載完整簡報 AI 壓縮檔</button></>}{phase === 'presentation-waiting' && <><button className="tool-btn" onClick={() => setPhase('outline')}>返回大綱</button><button className="tool-btn font-bold" onClick={() => void importPresentation()}>匯入 AI 完整簡報</button></>}</footer>
    </div>
  </div>;
}

function Waiting({ title, file, result }: { title: string; file: string; result: string }) {
  return <div className="mx-auto max-w-2xl space-y-3 py-12"><h3 className="text-[18px] font-bold">{title}</h3><ol className="list-decimal space-y-2 pl-5 text-[12px] leading-relaxed"><li>找到下載的 <strong>{file}</strong>。</li><li>把整個壓縮檔上傳給 ChatGPT、Claude、Gemini 或其他 AI。</li><li>請 AI 先讀取壓縮檔內的 AI-INSTRUCTIONS.md。</li><li>下載 AI 回傳的 <strong>{result}</strong>。</li><li>回到這裡按「匯入」。</li></ol></div>;
}
