import { useMemo, useState, type ReactNode } from 'react';
import { editorStore, useEditorState } from '../store/editorStore';
import { LAYER } from '../lib/layers';
import type { ValidationReport } from '../model/types';
import type { MergeSummary } from '../model/patch';
import { copyToClipboard } from '../lib/files';
import { exportValidationReport } from '../actions';
import { Icon } from './Icon';
import { SLIDE_LAYOUTS } from '../model/layouts';
import { findInPresentation } from '../model/search';
import { FONT_CHOICES, fontIdOfStack, fontStackOf } from '../lib/fonts';
import { libraryUsageBytes } from '../lib/library';

function Modal({
  title,
  subtitle,
  children,
  footer,
  width = 620,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/40 p-6"
      style={{ zIndex: LAYER.dialog }}
      onClick={() => editorStore.closeDialog()}
    >
      <div
        className="panel-card aps-fade-in flex max-h-[82vh] w-full flex-col overflow-hidden shadow-2xl"
        style={{ maxWidth: width }}
        onClick={(e) => e.stopPropagation()}
      >
        <header
          className="flex items-start justify-between gap-4 border-b px-5 py-3.5"
          style={{ borderColor: 'var(--color-line)' }}
        >
          <div>
            <h2 className="text-[14px] font-bold">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[11.5px] text-ink-3">{subtitle}</p>}
          </div>
          <button type="button" className="tool-btn px-1.5" onClick={() => editorStore.closeDialog()}>
            <Icon name="close" size={15} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <footer
            className="flex items-center justify-end gap-2 border-t px-5 py-3"
            style={{ borderColor: 'var(--color-line)' }}
          >
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-lg px-3 py-2 text-center" style={{ background: 'var(--color-panel-2)' }}>
      <div className="text-[18px] font-bold" style={{ color }}>
        {value}
      </div>
      <div className="text-[11px] text-ink-3">{label}</div>
    </div>
  );
}

function ValidationDialog({ report }: { report: ValidationReport }) {
  const statusText =
    report.status === 'success' ? '通過' : report.status === 'warning' ? '通過（有提醒）' : '有錯誤';
  const statusColor =
    report.status === 'success'
      ? 'var(--color-ok)'
      : report.status === 'warning'
        ? 'var(--color-warn)'
        : 'var(--color-danger)';

  return (
    <Modal
      title="驗證結果"
      subtitle={`檢查時間 ${new Date(report.checkedAt).toLocaleString('zh-TW')}`}
      footer={
        <>
          <button type="button" className="tool-btn" onClick={exportValidationReport}>
            <Icon name="download" size={14} />
            匯出 validation-report.json
          </button>
          <button
            type="button"
            className="tool-btn"
            style={{ background: 'var(--color-brand)', color: 'var(--color-brand-ink)' }}
            onClick={() => editorStore.closeDialog()}
          >
            關閉
          </button>
        </>
      }
    >
      <div className="mb-4 flex items-center gap-2 text-[13px] font-bold" style={{ color: statusColor }}>
        <Icon name={report.status === 'error' ? 'alert' : 'check'} size={16} />
        整體狀態：{statusText}
      </div>

      <div className="mb-4 grid grid-cols-4 gap-2">
        <StatCard label="投影片" value={report.slides} />
        <StatCard label="元素" value={report.elements} />
        <StatCard label="AI 任務" value={report.aiTasks.total} />
        <StatCard label="待處理" value={report.aiTasks.pending} color="var(--color-brand)" />
        <StatCard label="已完成" value={report.aiTasks.completed} color="var(--color-ok)" />
        <StatCard label="失敗" value={report.aiTasks.failed} color="var(--color-danger)" />
        <StatCard label="超出邊界" value={report.validation.outOfBounds} color="var(--color-warn)" />
        <StatCard label="ID 重複" value={report.validation.duplicateIds} color="var(--color-danger)" />
      </div>

      {report.issues.length === 0 ? (
        <p className="text-[12px] text-ink-2">沒有發現任何問題，可以放心匯出 AI Package。</p>
      ) : (
        <ul className="space-y-1.5">
          {report.issues.map((issue, i) => (
            <li
              key={`${issue.code}-${i}`}
              className="rounded-lg px-3 py-2 text-[12px]"
              style={{
                background:
                  issue.severity === 'error' ? 'var(--color-danger-soft)' : 'var(--color-warn-soft)',
                color: issue.severity === 'error' ? 'var(--color-danger)' : 'var(--color-warn)',
              }}
            >
              <span className="font-mono text-[10px] opacity-70">{issue.code}</span>
              <div className="text-ink">{issue.message}</div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function MergeDialog({ title, summary }: { title: string; summary: MergeSummary }) {
  const statusText =
    summary.status === 'success' ? '全部完成' : summary.status === 'partial' ? '部分完成' : '未套用';
  const statusColor =
    summary.status === 'success'
      ? 'var(--color-ok)'
      : summary.status === 'partial'
        ? 'var(--color-warn)'
        : 'var(--color-danger)';

  return (
    <Modal
      title={title}
      subtitle="非 AI 元件一律保留原狀，不會被外部結果覆寫。"
      footer={
        <button
          type="button"
          className="tool-btn"
          style={{ background: 'var(--color-brand)', color: 'var(--color-brand-ink)' }}
          onClick={() => editorStore.closeDialog()}
        >
          完成
        </button>
      }
    >
      <div className="mb-3 flex items-center gap-2 text-[13px] font-bold" style={{ color: statusColor }}>
        <Icon name={summary.status === 'failed' ? 'alert' : 'check'} size={16} />
        {statusText}
      </div>

      <div className="mb-4 grid grid-cols-4 gap-2">
        <StatCard label="任務總數" value={summary.total} />
        <StatCard label="已套用" value={summary.applied} color="var(--color-ok)" />
        <StatCard label="略過" value={summary.skipped} color="var(--color-warn)" />
        <StatCard label="失敗" value={summary.failed} color="var(--color-danger)" />
      </div>

      {summary.sanitized.length > 0 && (
        <div
          className="mb-3 rounded-lg px-3 py-2 text-[11.5px]"
          style={{ background: 'var(--color-warn-soft)', color: 'var(--color-warn)' }}
        >
          為了安全，已從 AI 產生的內容中移除：{summary.sanitized.join('、')}
        </div>
      )}

      <ul className="space-y-1.5">
        {summary.details.map((d, i) => (
          <li
            key={i}
            className="rounded-lg px-3 py-2 text-[12px]"
            style={{ background: 'var(--color-panel-2)' }}
          >
            <div className="flex items-center gap-2">
              <span
                style={{
                  color:
                    d.outcome === 'applied'
                      ? 'var(--color-ok)'
                      : d.outcome === 'skipped'
                        ? 'var(--color-warn)'
                        : 'var(--color-danger)',
                }}
              >
                {d.outcome === 'applied' ? '✓' : d.outcome === 'skipped' ? '–' : '⚠'}
              </span>
              {d.taskId && <span className="font-mono text-[10.5px] text-ink-3">{d.taskId}</span>}
              <span className="flex-1">{d.message}</span>
            </div>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

function AiPromptDialog({ text }: { text: string }) {
  return (
    <Modal
      title="AI 指令"
      subtitle="把這段文字貼到任何 AI 對話視窗，並附上 presentation.json。"
      footer={
        <button
          type="button"
          className="tool-btn"
          style={{ background: 'var(--color-brand)', color: 'var(--color-brand-ink)' }}
          onClick={async () => {
            const ok = await copyToClipboard(text);
            editorStore.toast({
              tone: ok ? 'success' : 'error',
              title: ok ? '已複製到剪貼簿' : '複製失敗，請手動選取文字',
            });
          }}
        >
          <Icon name="clipboard" size={14} />
          複製
        </button>
      }
    >
      <textarea
        readOnly
        className="field-input min-h-[320px] w-full font-mono text-[11.5px] leading-relaxed"
        value={text}
      />
    </Modal>
  );
}

function SettingsDialog() {
  const state = useEditorState();
  const { settings, metadata } = state.presentation;
  return (
    <Modal title="簡報設定" width={480}>
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-[11px] text-ink-3">簡報標題</span>
          <input
            className="field-input"
            value={metadata.title}
            onChange={(e) => editorStore.updateMetadata({ title: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] text-ink-3">描述</span>
          <textarea
            className="field-input min-h-[64px]"
            value={metadata.description}
            onChange={(e) => editorStore.updateMetadata({ description: e.target.value })}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-[11px] text-ink-3">寬度（px）</span>
            <input
              type="number"
              className="field-input"
              value={settings.width}
              onChange={(e) =>
                Number(e.target.value) > 0 &&
                editorStore.updateSettings({ width: Number(e.target.value) })
              }
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] text-ink-3">高度（px）</span>
            <input
              type="number"
              className="field-input"
              value={settings.height}
              onChange={(e) =>
                Number(e.target.value) > 0 &&
                editorStore.updateSettings({ height: Number(e.target.value) })
              }
            />
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-[11px] text-ink-3">整份簡報的預設字型</span>
          <select
            className="field-input"
            value={fontIdOfStack(state.presentation.theme.fontFamily)}
            onChange={(e) => editorStore.setThemeFont(fontStackOf(e.target.value))}
          >
            {FONT_CHOICES.map((choice) => (
              <option key={choice.id} value={choice.id}>
                {choice.label}　{choice.hint}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-[11px] leading-snug text-ink-3">
            清單裡都是 Windows 與 Mac 都有、而且尺寸一致的字型。
            換一台電腦開啟匯出的檔案，版面不會跑掉。
            Android 手機沒有這些字型，仍可能略有差異。
          </span>
        </label>

        <div className="rounded-lg px-3 py-2 text-[11px] text-ink-2" style={{ background: 'var(--color-panel-2)' }}>
          協定：<span className="font-mono">{state.presentation.protocol}</span>
          <br />
          規格版本：<span className="font-mono">{state.presentation.version}</span>
          <br />
          簡報 ID：<span className="font-mono">{metadata.id}</span>
        </div>
      </div>
    </Modal>
  );
}

const SHORTCUTS: Array<[string, string]> = [
  ['Ctrl + Z', '復原'],
  ['Ctrl + Shift + Z / Ctrl + Y', '重做'],
  ['Ctrl + S', '儲存'],
  ['Ctrl + C / Ctrl + V', '複製 / 貼上'],
  ['Ctrl + D', '再製'],
  ['Ctrl + A', '全選本頁'],
  ['Ctrl + F', '搜尋與取代'],
  ['Ctrl + G', '建立群組'],
  ['Ctrl + Shift + G', '取消群組'],
  ['Ctrl + 0', '符合視窗'],
  ['Ctrl + 滾輪', '縮放畫布'],
  ['Delete / Backspace', '刪除選取元素'],
  ['← ↑ ↓ →', '移動元素 1px'],
  ['Shift + 方向鍵', '移動元素 10px'],
  ['F5', '開始播放'],
  ['N（播放中）', '講者檢視：備註、下一頁、計時'],
  ['Esc', '取消選取 / 離開預覽'],
  ['V / T / R / O', '切換選取 / 文字 / 矩形 / 圓形工具'],
  ['雙擊文字', '直接編輯文字'],
  ['Shift + 點選', '複選元素'],
  ['右鍵', '開啟快捷選單'],
  ['Ctrl / Shift + 點縮圖', '加選 / 連選投影片'],
  ['空白鍵 + 拖曳', '平移畫布'],
  ['Alt + 拖曳', '暫時關閉自動對齊'],
];

function HelpDialog() {
  return (
    <Modal title="說明與快捷鍵" subtitle="AI Presentation Studio｜單機版 MVP">
      <div className="mb-4 space-y-2 text-[12px] leading-relaxed text-ink-2">
        <p>
          這是一個 <strong className="text-ink">Local-first</strong> 的簡報編輯器：
          所有資料都留在你的瀏覽器裡，不會送到任何伺服器，也沒有連接任何 AI API。
        </p>
        <p>
          核心概念是把簡報視為一份規格（Presentation Specification）。
          你可以在任意位置放上 <strong className="text-brand">AI 元件</strong>，
          宣告「這裡有一個待 AI 完成的任務」，然後：
        </p>
        <ol className="ml-4 list-decimal space-y-1">
          <li>匯出 AI Package（presentation-ai.zip）</li>
          <li>交給 Claude／ChatGPT／Gemini／Grok／SPADE 等外部 AI</li>
          <li>取回 completed-presentation.json 或 Patch</li>
          <li>用「AI → 匯入 AI 完成結果」匯回，生成內容會落在原本指定的位置</li>
          <li>匯出 HTML，得到可直接開啟播放的單一檔案</li>
        </ol>
      </div>
      <h3 className="mb-2 text-[12px] font-bold">鍵盤快捷鍵</h3>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {SHORTCUTS.map(([key, desc]) => (
          <div key={key} className="flex items-center justify-between gap-3 text-[11.5px]">
            <span className="font-mono text-ink-2">{key}</span>
            <span className="text-ink-3">{desc}</span>
          </div>
        ))}
      </div>
    </Modal>
  );
}

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  danger,
  onConfirm,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Modal
      title={title}
      width={440}
      footer={
        <>
          <button type="button" className="tool-btn" onClick={() => editorStore.closeDialog()}>
            取消
          </button>
          <button
            type="button"
            className="tool-btn font-bold"
            style={
              danger
                ? { background: 'var(--color-danger)', color: '#fff' }
                : { background: 'var(--color-brand)', color: 'var(--color-brand-ink)' }
            }
            onClick={() => {
              editorStore.closeDialog();
              onConfirm();
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-[12.5px] leading-relaxed text-ink-2">{message}</p>
    </Modal>
  );
}

/** 版型縮圖：用幾個灰色方塊示意排版，不需要真的算出內容。 */
function LayoutPreview({ id }: { id: string }) {
  const bar = (style: React.CSSProperties, key: string) => (
    <div key={key} style={{ position: 'absolute', borderRadius: 2, ...style }} />
  );
  const ink = 'var(--color-ink-3)';
  const soft = 'var(--color-panel-2)';
  const brand = 'var(--color-brand)';

  const shapes: Record<string, React.ReactNode[]> = {
    blank: [],
    title: [
      bar({ left: '12%', top: '38%', width: '64%', height: '14%', background: ink }, 'a'),
      bar({ left: '12%', top: '58%', width: '14%', height: '5%', background: brand }, 'b'),
      bar({ left: '12%', top: '68%', width: '42%', height: '8%', background: soft }, 'c'),
    ],
    'title-content': [
      bar({ left: '8%', top: '12%', width: '56%', height: '11%', background: ink }, 'a'),
      bar({ left: '8%', top: '28%', width: '9%', height: '4%', background: brand }, 'b'),
      bar({ left: '8%', top: '40%', width: '84%', height: '44%', background: soft }, 'c'),
    ],
    'two-column': [
      bar({ left: '8%', top: '12%', width: '56%', height: '11%', background: ink }, 'a'),
      bar({ left: '8%', top: '28%', width: '9%', height: '4%', background: brand }, 'b'),
      bar({ left: '8%', top: '40%', width: '40%', height: '44%', background: soft }, 'c'),
      bar({ left: '52%', top: '40%', width: '40%', height: '44%', background: soft }, 'd'),
    ],
    'image-text': [
      bar({ left: '8%', top: '12%', width: '56%', height: '11%', background: ink }, 'a'),
      bar({ left: '8%', top: '28%', width: '9%', height: '4%', background: brand }, 'b'),
      bar(
        { left: '8%', top: '40%', width: '44%', height: '44%', background: ink, opacity: 0.35 },
        'c',
      ),
      bar({ left: '56%', top: '40%', width: '36%', height: '44%', background: soft }, 'd'),
    ],
  };

  return (
    <div
      className="relative w-full overflow-hidden rounded-md border"
      style={{
        aspectRatio: '16 / 9',
        background: 'var(--color-panel)',
        borderColor: 'var(--color-line)',
      }}
    >
      {shapes[id] ?? []}
    </div>
  );
}

function LayoutDialog({ afterSlideId }: { afterSlideId?: string }) {
  return (
    <Modal title="選擇版型" subtitle="挑一個起點，之後隨時可以改" width={720}>
      <div className="grid grid-cols-3 gap-3">
        {SLIDE_LAYOUTS.map((layout) => (
          <button
            key={layout.id}
            type="button"
            className="panel-card flex flex-col gap-2 p-2.5 text-left transition hover:bg-panel-2"
            onClick={() => {
              editorStore.closeDialog();
              editorStore.addSlide(afterSlideId, layout.id);
              editorStore.toast({ tone: 'success', title: `已新增「${layout.name}」投影片` });
            }}
          >
            <LayoutPreview id={layout.id} />
            <div>
              <div className="text-[12.5px] font-bold">{layout.name}</div>
              <div className="mt-0.5 text-[11px] leading-snug text-ink-3">
                {layout.description}
              </div>
            </div>
          </button>
        ))}
      </div>
    </Modal>
  );
}

function LibraryDialog() {
  const state = useEditorState();
  const decks = editorStore.decks();
  const currentId = state.presentation.metadata.id;
  const [name, setName] = useState('');
  const usageMb = (
    (globalThis.localStorage ? libraryUsageBytes(globalThis.localStorage) : 0) /
    1024 /
    1024
  ).toFixed(1);

  return (
    <Modal
      title="我的簡報"
      subtitle="全部存在這台電腦的瀏覽器裡，不會上傳"
      width={600}
      footer={
        <>
          <input
            className="field-input mr-auto max-w-[240px]"
            placeholder="另存新檔的名稱"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            type="button"
            className="tool-btn"
            onClick={() => {
              editorStore.saveAsNewDeck(name);
              editorStore.closeDialog();
            }}
          >
            <Icon name="copy" size={14} />
            另存新檔
          </button>
          <button type="button" className="tool-btn" onClick={() => editorStore.closeDialog()}>
            關閉
          </button>
        </>
      }
    >
      {decks.length === 0 ? (
        <p className="py-8 text-center text-[12px] text-ink-3">還沒有存過任何簡報。</p>
      ) : (
        <ul className="space-y-1.5">
          {decks.map((deck) => {
            const current = deck.id === currentId;
            return (
              <li
                key={deck.id}
                className="flex items-center gap-2 rounded-lg border p-2.5"
                style={{
                  borderColor: current ? 'var(--color-brand)' : 'var(--color-line)',
                  background: current ? 'var(--color-brand-soft)' : 'transparent',
                }}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-bold">
                    {deck.title}
                    {current && <span className="ml-2 text-[11px] text-brand">編輯中</span>}
                  </div>
                  <div className="mt-0.5 text-[11px] text-ink-3">
                    {deck.slideCount} 頁　·　{new Date(deck.updatedAt).toLocaleString('zh-TW')}
                  </div>
                </div>
                <button
                  type="button"
                  className="tool-btn"
                  disabled={current}
                  onClick={() => {
                    editorStore.openDeck(deck.id);
                    editorStore.closeDialog();
                  }}
                >
                  開啟
                </button>
                <button
                  type="button"
                  className="tool-btn px-2"
                  disabled={current}
                  title="從清單刪除"
                  aria-label={`刪除「${deck.title}」`}
                  style={{ color: 'var(--color-danger)' }}
                  onClick={() =>
                    editorStore.confirm({
                      title: '刪除簡報',
                      message: `確定要從清單刪除「${deck.title}」嗎？這個動作無法復原。`,
                      confirmLabel: '刪除',
                      danger: true,
                      onConfirm: () => editorStore.removeDeck(deck.id),
                    })
                  }
                >
                  <Icon name="trash" size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 text-[11px] leading-relaxed text-ink-3">
        目前這份清單佔用約 {usageMb} MB。
        瀏覽器給每個網站的空間有上限（Chrome／Edge 實測約 49 MB），內嵌很多圖片會很快用完。
        建議把不常用的簡報「匯出 JSON」留存到自己的資料夾後，從這裡刪掉。
      </p>
    </Modal>
  );
}

function FindDialog() {
  const state = useEditorState();
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);

  const hits = useMemo(
    () => findInPresentation(state.presentation, query, { caseSensitive }),
    [state.presentation, query, caseSensitive],
  );
  const total = hits.reduce((sum, hit) => sum + hit.count, 0);

  return (
    <Modal
      title="搜尋與取代"
      subtitle="找的是文字元素與表格的內容"
      width={560}
      footer={
        <>
          <span className="mr-auto text-[11.5px] text-ink-3">
            {query.trim() === '' ? '輸入要找的文字' : `找到 ${total} 處，分布在 ${hits.length} 個元素`}
          </span>
          <button type="button" className="tool-btn" onClick={() => editorStore.closeDialog()}>
            關閉
          </button>
          <button
            type="button"
            className="tool-btn font-bold"
            disabled={total === 0}
            style={{ background: 'var(--color-brand)', color: 'var(--color-brand-ink)' }}
            onClick={() => {
              editorStore.replaceAllText(query, replacement, { caseSensitive });
              editorStore.closeDialog();
            }}
          >
            全部取代
          </button>
        </>
      }
    >
      <div className="space-y-2.5">
        <label className="block">
          <span className="mb-1 block text-[11px] text-ink-3">搜尋</span>
          <input
            autoFocus
            className="field-input"
            value={query}
            placeholder="要找的文字"
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] text-ink-3">取代為</span>
          <input
            className="field-input"
            value={replacement}
            placeholder="留空代表刪除找到的文字"
            onChange={(e) => setReplacement(e.target.value)}
          />
        </label>
        <label className="flex items-center gap-2 text-[11.5px] text-ink-2">
          <input
            type="checkbox"
            checked={caseSensitive}
            onChange={(e) => setCaseSensitive(e.target.checked)}
          />
          區分英文大小寫
        </label>

        {hits.length > 0 && (
          <div className="max-h-[240px] space-y-1 overflow-y-auto pt-1">
            {hits.map((hit) => (
              <button
                key={`${hit.slideId}-${hit.elementId}`}
                type="button"
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition hover:bg-panel-2"
                onClick={() => {
                  editorStore.gotoHit(hit.slideId, hit.elementId);
                  editorStore.closeDialog();
                }}
              >
                <span className="shrink-0 font-mono text-[11px] text-ink-3">
                  第 {hit.slideIndex + 1} 頁
                </span>
                <span className="flex-1 truncate text-[12px]">{hit.preview}</span>
                <span className="shrink-0 text-[11px] text-ink-3">{hit.count} 處</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

export function Dialogs() {
  const state = useEditorState();
  const dialog = state.dialog;
  if (!dialog) return null;

  switch (dialog.kind) {
    case 'validation':
      return <ValidationDialog report={dialog.report} />;
    case 'merge':
      return <MergeDialog title={dialog.title} summary={dialog.summary} />;
    case 'ai-prompt':
      return <AiPromptDialog text={dialog.text} />;
    case 'settings':
      return <SettingsDialog />;
    case 'help':
      return <HelpDialog />;
    case 'find':
      return <FindDialog />;
    case 'library':
      return <LibraryDialog />;
    case 'layout':
      return <LayoutDialog afterSlideId={dialog.afterSlideId} />;
    case 'confirm':
      return (
        <ConfirmDialog
          title={dialog.title}
          message={dialog.message}
          confirmLabel={dialog.confirmLabel}
          danger={dialog.danger}
          onConfirm={dialog.onConfirm}
        />
      );
    default:
      return null;
  }
}

export function Toasts() {
  const state = useEditorState();
  if (state.toasts.length === 0) return null;

  const toneColor: Record<string, string> = {
    info: 'var(--color-brand)',
    success: 'var(--color-ok)',
    warning: 'var(--color-warn)',
    error: 'var(--color-danger)',
  };

  return (
    <div className="pointer-events-none fixed bottom-16 right-4 flex w-[340px] flex-col gap-2"
      style={{ zIndex: LAYER.toast }}>
      {state.toasts.map((toast) => (
        <div
          key={toast.id}
          className="panel-card aps-fade-in pointer-events-auto flex items-start gap-2.5 p-3 shadow-xl"
          style={{ borderLeft: `3px solid ${toneColor[toast.tone]}` }}
        >
          <span style={{ color: toneColor[toast.tone] }}>
            <Icon name={toast.tone === 'error' || toast.tone === 'warning' ? 'alert' : 'check'} size={15} />
          </span>
          <div className="flex-1">
            <div className="text-[12px] font-bold">{toast.title}</div>
            {toast.detail && <div className="mt-0.5 text-[11px] leading-relaxed text-ink-2">{toast.detail}</div>}
          </div>
          <button
            type="button"
            className="tool-btn px-1 py-0.5"
            onClick={() => editorStore.dismissToast(toast.id)}
          >
            <Icon name="close" size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
