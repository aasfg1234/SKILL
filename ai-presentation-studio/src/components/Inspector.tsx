import { useEffect, useRef, type ReactNode } from 'react';
import { editorStore, useEditorState } from '../store/editorStore';
import type { AIComponentKind, AIOutputFormat, SlideElement } from '../model/types';
import {
  AI_FORMAT_LABELS,
  AI_FORMAT_ORDER,
  AI_KIND_LABELS,
  AI_KIND_ORDER,
  AI_STATUS_ICON,
  AI_STATUS_LABELS,
  ELEMENT_TYPE_LABELS,
  suggestedFormat,
} from '../lib/labels';
import { simulateAiCompletion } from '../actions';
import { pickImageFile } from '../lib/files';
import { Icon } from './Icon';
import {
  insertTableColumn,
  insertTableRow,
  removeTableColumn,
  removeTableRow,
} from '../model/table';
import { FONT_CHOICES, fontIdOfStack, fontStackOf } from '../lib/fonts';
import { masterKindForSlide } from '../model/master';
import { SHAPE_KINDS, SHAPE_LABELS, type ShapeKind } from '../model/shapes';
import { normalizeCrop } from '../model/imageCrop';
import type { ImageCrop } from '../model/types';
import {
  CHART_TYPES,
  insertSeriesRow,
  moveSeriesRow,
  parsePastedSeries,
  seriesOf,
  sortSeriesRows,
} from '../model/chart';

/** 右側屬性面板：位置、大小、樣式與 AI 設定。 */

function Section({
  title,
  icon,
  children,
  action,
}: {
  title: string;
  icon?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="border-b px-3.5 py-3" style={{ borderColor: 'var(--color-line-2)' }}>
      <div className="mb-2.5 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-ink-2">
          {icon && <Icon name={icon} size={13} />}
          {title}
        </h3>
        {action}
      </div>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-ink-3">{label}</span>
      {children}
    </label>
  );
}

function NumberInput({
  value,
  onChange,
  step = 1,
  min,
  suffix,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  suffix?: string;
}) {
  return (
    <div className="relative">
      <input
        type="number"
        className="field-input"
        value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0}
        step={step}
        min={min}
        onChange={(e) => {
          const next = Number(e.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-ink-3">
          {suffix}
        </span>
      )}
    </div>
  );
}

function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="color"
        value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-9 cursor-pointer rounded-md border"
        style={{ borderColor: 'var(--color-line)', background: 'transparent' }}
      />
      <input
        className="field-input font-mono text-[11.5px]"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <button type="button" className="tool-btn flex-1 justify-center" data-active={active} onClick={onClick} title={title}>
      {children}
    </button>
  );
}

/**
 * 字型選單。
 *
 * 只提供各系統都有、而且尺寸一致的組合，換一台電腦開也不會跑版。
 * 詳見 src/lib/fonts.ts。
 */
function FontSelect({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (stack: string) => void;
}) {
  const current = fontIdOfStack(value);
  return (
    <Field label="字型">
      <select
        className="field-input"
        value={current}
        onChange={(e) => onChange(fontStackOf(e.target.value))}
      >
        {FONT_CHOICES.map((choice) => (
          <option key={choice.id} value={choice.id}>
            {choice.label}　{choice.hint}
          </option>
        ))}
      </select>
    </Field>
  );
}

function SlideInspector() {
  const state = useEditorState();
  const slide = state.masterMode
    ? state.presentation.masters?.[state.masterMode]
    : state.presentation.slides.find((s) => s.id === state.currentSlideId);
  if (!slide) return null;
  const slideIndex = state.presentation.slides.findIndex((s) => s.id === slide.id);
  const index = slideIndex + 1;

  return (
    <>
      <Section title="簡報" icon="file">
        <Field label="簡報標題">
          <input
            className="field-input"
            value={state.presentation.metadata.title}
            onChange={(e) => editorStore.updateMetadata({ title: e.target.value })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="寬度">
            <NumberInput
              value={state.presentation.settings.width}
              min={1}
              onChange={(v) => v > 0 && editorStore.updateSettings({ width: Math.round(v) })}
              suffix="px"
            />
          </Field>
          <Field label="高度">
            <NumberInput
              value={state.presentation.settings.height}
              min={1}
              onChange={(v) => v > 0 && editorStore.updateSettings({ height: Math.round(v) })}
              suffix="px"
            />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-[11.5px] text-ink-2">
          <input
            type="checkbox"
            checked={state.presentation.settings.showSlideNumbers === true}
            onChange={(e) => editorStore.updateSettings({ showSlideNumbers: e.target.checked })}
          />
          自動顯示頁碼
        </label>
        {state.presentation.settings.showSlideNumbers === true && (
          <label className="flex items-center gap-2 text-[11.5px] text-ink-2">
            <input
              type="checkbox"
              checked={state.presentation.settings.hideNumberOnCover === true}
              onChange={(e) => editorStore.updateSettings({ hideNumberOnCover: e.target.checked })}
            />
            封面不顯示頁碼
          </label>
        )}
      </Section>

      <Section
        title={state.masterMode
          ? `${state.masterMode === 'cover' ? '封面' : '內容'}母片設計`
          : `投影片 ${index}`}
        icon="slides"
      >
        {!state.masterMode && (
          <Field label="標題">
            <input
              className="field-input"
              value={slide.title}
              onChange={(e) => editorStore.updateSlide(slide.id, { title: e.target.value })}
            />
          </Field>
        )}
        {!state.masterMode && (
          <Field label="使用母片">
            <select
              className="field-input"
              value={masterKindForSlide(slide, slideIndex)}
              onChange={(e) => editorStore.updateSlide(slide.id, {
                masterKind: e.target.value as 'cover' | 'content',
                useMasterBackground: true,
              })}
            >
              <option value="cover">封面母片</option>
              <option value="content">內容母片</option>
            </select>
          </Field>
        )}
        {!state.masterMode && (
          <label className="flex items-center gap-2 text-[11.5px] text-ink-2">
            <input
              type="checkbox"
              checked={slide.useMasterBackground === true}
              onChange={(e) => editorStore.updateSlide(slide.id, { useMasterBackground: e.target.checked })}
            />
            使用母片背景
          </label>
        )}
        {!state.masterMode && (
          <label className="flex items-center gap-2 text-[11.5px] text-ink-2">
            <input
              type="checkbox"
              checked={slide.hidden === true}
              onChange={() => editorStore.toggleSlideHidden(slide.id)}
            />
            播放與匯出時跳過這一頁
          </label>
        )}
        <Field label="背景色">
          <ColorInput
            value={slide.background}
            onChange={(v) =>
              state.masterMode
                ? editorStore.updateMaster({ background: v })
                : editorStore.updateSlide(slide.id, { background: v, useMasterBackground: false })
            }
          />
        </Field>
        {state.masterMode && (
          <button
            type="button"
            className="tool-btn w-full justify-center"
            onClick={() => editorStore.applyMasterBackgroundToAllSlides()}
          >
            套用背景到使用這張母片的投影片
          </button>
        )}
        {!state.masterMode && (
          <Field label="備註">
            <textarea
              className="field-input min-h-[72px] resize-y"
              value={slide.notes}
              placeholder="這一頁要講的重點…"
              onChange={(e) => editorStore.updateSlide(slide.id, { notes: e.target.value })}
            />
          </Field>
        )}
        {state.masterMode && (
          <button type="button" className="tool-btn w-full justify-center" onClick={() => editorStore.exitMasterMode()}>
            返回投影片
          </button>
        )}
      </Section>

      <div className="px-3.5 py-4 text-[11.5px] leading-relaxed text-ink-3">
        {state.masterMode ? '母片元素會出現在套用這張母片的投影片。' : '在畫布上點選元素即可編輯其屬性。'}
        <br />
        {state.masterMode ? '使用下方工具列新增共用文字、圖形或圖片。' : <>使用下方工具列可以新增文字、圖形、圖片與 <strong className="text-brand">AI 元件</strong>。</>}
      </div>
    </>
  );
}

function AiSettings({ el }: { el: Extract<SlideElement, { type: 'ai_component' }> }) {
  const promptRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!el.prompt.trim()) promptRef.current?.focus();
  }, [el.id]);

  const statusColor =
    el.status === 'completed'
      ? 'var(--color-ok)'
      : el.status === 'error'
        ? 'var(--color-danger)'
        : 'var(--color-brand)';

  return (
    <Section title="AI 設定" icon="sparkles">
      <div
        className="flex items-center justify-between rounded-lg px-2.5 py-2"
        style={{ background: 'var(--color-brand-soft)' }}
      >
        <span className="font-mono text-[11px] text-ink-2">{el.taskId}</span>
        <span className="flex items-center gap-1 text-[11.5px] font-bold" style={{ color: statusColor }}>
          <span className={el.status === 'processing' ? 'aps-spin inline-block' : undefined}>
            {AI_STATUS_ICON[el.status]}
          </span>
          {AI_STATUS_LABELS[el.status]}
        </span>
      </div>

      <Field label="類型">
        <select
          className="field-input"
          value={el.kind}
          onChange={(e) => {
            const kind = e.target.value as AIComponentKind;
            editorStore.updateElement(el.id, {
              kind,
              outputFormat: suggestedFormat(kind),
            });
          }}
        >
          {AI_KIND_ORDER.map((kind) => (
            <option key={kind} value={kind}>
              {AI_KIND_LABELS[kind]}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Prompt（要 AI 生成什麼）">
        <textarea
          ref={promptRef}
          className="field-input min-h-[104px] resize-y leading-relaxed"
          value={el.prompt}
          placeholder="例如：製作 2024～2026 營收成長圖，使用專業企業簡報風格。"
          onFocus={() => editorStore.beginTransaction()}
          onChange={(e) =>
            editorStore.updateElement(el.id, { prompt: e.target.value }, { transient: true })
          }
          onBlur={() => editorStore.endTransaction()}
        />
      </Field>

      <Field label="輸出格式">
        <select
          className="field-input"
          value={el.outputFormat}
          onChange={(e) =>
            editorStore.updateElement(el.id, { outputFormat: e.target.value as AIOutputFormat })
          }
        >
          {AI_FORMAT_ORDER.map((format) => (
            <option key={format} value={format}>
              {AI_FORMAT_LABELS[format]}
            </option>
          ))}
        </select>
      </Field>

      {el.status === 'error' && el.errorMessage && (
        <div
          className="rounded-lg px-2.5 py-2 text-[11.5px]"
          style={{ background: 'var(--color-danger-soft)', color: 'var(--color-danger)' }}
        >
          {el.errorMessage}
        </div>
      )}

      {el.result && (
        <div className="rounded-lg px-2.5 py-2 text-[11px] text-ink-2" style={{ background: 'var(--color-panel-2)' }}>
          已填入 {el.result.type.toUpperCase()} 結果
          {el.result.producer ? `（來源：${el.result.producer}）` : ''}
          {el.result.producedAt
            ? `　${new Date(el.result.producedAt).toLocaleString('zh-TW')}`
            : ''}
        </div>
      )}

      <div className="flex flex-col gap-1.5 pt-1">
        <button
          type="button"
          className="tool-btn justify-center"
          style={{ background: 'var(--color-panel-2)', border: '1px solid var(--color-line)' }}
          onClick={() => simulateAiCompletion([el.taskId])}
        >
          <Icon name="sparkles" size={14} />
          模擬 AI 完成（Demo）
        </button>
        {el.result && (
          <button
            type="button"
            className="tool-btn justify-center"
            onClick={() =>
              editorStore.updateElement(el.id, {
                status: 'pending',
                result: undefined,
                errorMessage: undefined,
              })
            }
          >
            <Icon name="refresh" size={14} />
            清除結果並改回等待處理
          </button>
        )}
        <p className="text-[10.5px] leading-relaxed text-ink-3">
          本程式不連接任何 AI API。「模擬 AI 完成」只會在本機產生標示為模擬的假內容，
          用來測試 待處理 → 已完成 的流程。
        </p>
      </div>
    </Section>
  );
}

function ElementInspector({ elements }: { elements: SlideElement[] }) {
  const el = elements[0];
  const multi = elements.length > 1;
  const update = (props: Record<string, unknown>) =>
    multi ? editorStore.updateSelected(props) : editorStore.updateElement(el.id, props);

  return (
    <>
      <Section
        title={multi ? `已選取 ${elements.length} 個元素` : ELEMENT_TYPE_LABELS[el.type]}
        icon="layers"
        action={
          <div className="flex gap-0.5">
            <button
              type="button"
              className="tool-btn px-1.5 py-1"
              title={el.locked ? '解除鎖定' : '鎖定'}
              data-active={el.locked}
              onClick={() => editorStore.updateSelected({ locked: !el.locked })}
            >
              <Icon name={el.locked ? 'lock' : 'unlock'} size={14} />
            </button>
            <button
              type="button"
              className="tool-btn px-1.5 py-1"
              title={el.hidden ? '顯示' : '隱藏'}
              data-active={el.hidden}
              onClick={() => editorStore.updateSelected({ hidden: !el.hidden })}
            >
              <Icon name={el.hidden ? 'eye-off' : 'eye'} size={14} />
            </button>
            <button
              type="button"
              className="tool-btn px-1.5 py-1"
              title="刪除"
              style={{ color: 'var(--color-danger)' }}
              onClick={() => editorStore.deleteSelected()}
            >
              <Icon name="trash" size={14} />
            </button>
          </div>
        }
      >
        <div className="font-mono text-[10.5px] text-ink-3">{multi ? '多重選取' : el.id}</div>
      </Section>

      <Section title="位置與大小" icon="grid">
        {multi ? (
          <div
            className="rounded-lg border px-3 py-2 text-[11px] leading-relaxed text-ink-2"
            style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel-2)' }}
          >
            在畫布上拖曳外框即可移動。群組可以拖曳四角縮放，也可以拖曳圓點旋轉。
          </div>
        ) : (
        <div className="grid grid-cols-2 gap-2">
          <Field label="X">
            <NumberInput value={el.x} onChange={(v) => update({ x: Math.round(v) })} suffix="px" />
          </Field>
          <Field label="Y">
            <NumberInput value={el.y} onChange={(v) => update({ y: Math.round(v) })} suffix="px" />
          </Field>
          <Field label="寬">
            <NumberInput
              value={el.width}
              min={1}
              onChange={(v) => v > 0 && update({ width: Math.round(v) })}
              suffix="px"
            />
          </Field>
          <Field label="高">
            <NumberInput
              value={el.height}
              min={1}
              onChange={(v) => v > 0 && update({ height: Math.round(v) })}
              suffix="px"
            />
          </Field>
          <Field label="旋轉">
            <NumberInput value={el.rotation} onChange={(v) => update({ rotation: v })} suffix="°" />
          </Field>
          <Field label="透明度">
            <NumberInput
              value={el.opacity}
              step={0.05}
              min={0}
              onChange={(v) => update({ opacity: Math.min(1, Math.max(0, v)) })}
            />
          </Field>
        </div>
        )}

        <div>
          <span className="mb-1 block text-[11px] text-ink-3">對齊</span>
          <div className="flex gap-1">
            {(
              [
                ['left', 'align-left', '靠左'],
                ['center-x', 'align-center-x', '水平置中'],
                ['right', 'align-right', '靠右'],
                ['top', 'align-top', '靠上'],
                ['center-y', 'align-center-y', '垂直置中'],
                ['bottom', 'align-bottom', '靠下'],
              ] as const
            ).map(([mode, icon, title]) => (
              <button
                key={mode}
                type="button"
                className="tool-btn flex-1 justify-center px-1"
                title={title}
                onClick={() => editorStore.align(mode)}
              >
                <Icon name={icon} size={14} />
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="mb-1 block text-[11px] text-ink-3">層級</span>
          <div className="flex gap-1">
            <button type="button" className="tool-btn flex-1 justify-center" onClick={() => editorStore.reorder('front')}>
              <Icon name="front" size={14} />
              移至最上
            </button>
            <button type="button" className="tool-btn flex-1 justify-center" onClick={() => editorStore.reorder('back')}>
              <Icon name="back" size={14} />
              移至最下
            </button>
          </div>
        </div>
      </Section>

      {!multi && el.type === 'text' && (
        <Section title="文字樣式" icon="text">
          <Field label="內容">
            <textarea
              className="field-input min-h-[72px] resize-y"
              value={el.text}
              onFocus={() => editorStore.beginTransaction()}
              onChange={(e) =>
                editorStore.updateElement(el.id, { text: e.target.value }, { transient: true })
              }
              onBlur={() => editorStore.endTransaction()}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="字級">
              <NumberInput value={el.fontSize} min={1} onChange={(v) => v > 0 && update({ fontSize: v })} suffix="px" />
            </Field>
            <Field label="行高">
              <NumberInput value={el.lineHeight} step={0.1} onChange={(v) => update({ lineHeight: v })} />
            </Field>
          </div>
          <div className="flex gap-1">
            <ToggleButton active={el.bold} onClick={() => update({ bold: !el.bold })} title="粗體">
              <strong>B</strong>
            </ToggleButton>
            <ToggleButton active={el.italic} onClick={() => update({ italic: !el.italic })} title="斜體">
              <em>I</em>
            </ToggleButton>
            <ToggleButton
              active={el.underline}
              onClick={() => update({ underline: !el.underline })}
              title="底線"
            >
              <span className="underline">U</span>
            </ToggleButton>
          </div>
          <div className="flex gap-1">
            {(['left', 'center', 'right'] as const).map((align) => (
              <ToggleButton
                key={align}
                active={el.align === align}
                onClick={() => update({ align })}
                title={align === 'left' ? '靠左對齊' : align === 'center' ? '置中對齊' : '靠右對齊'}
              >
                <Icon name={`align-${align === 'center' ? 'center-x' : align}`} size={14} />
              </ToggleButton>
            ))}
          </div>
          <FontSelect value={el.fontFamily} onChange={(stack) => update({ fontFamily: stack })} />
          <Field label="條列">
            <div className="flex gap-1">
              {(
                [
                  ['none', '無'],
                  ['bullet', '• 項目符號'],
                  ['number', '1. 編號'],
                ] as const
              ).map(([style, label]) => (
                <ToggleButton
                  key={style}
                  active={el.listStyle === style}
                  onClick={() => update({ listStyle: style })}
                  title={label}
                >
                  <span className="text-[11px]">{label}</span>
                </ToggleButton>
              ))}
            </div>
          </Field>
          <Field label="文字顏色">
            <ColorInput value={el.color} onChange={(v) => update({ color: v })} />
          </Field>
          <Field label="字距">
            <NumberInput value={el.letterSpacing} step={0.5} onChange={(v) => update({ letterSpacing: v })} suffix="px" />
          </Field>
        </Section>
      )}

      {!multi && el.type === 'chart' && (
        <Section title="圖表" icon="chart">
          <Field label="圖表類型">
            <select
              className="field-input"
              value={el.chartType}
              onChange={(e) => update({ chartType: e.target.value })}
            >
              {CHART_TYPES.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.label}　{type.hint}
                </option>
              ))}
            </select>
          </Field>

          <Field label="圖表標題（留白就不顯示）">
            <input
              className="field-input"
              value={el.title}
              onChange={(e) => update({ title: e.target.value })}
            />
          </Field>

          <Field label="從 Excel／試算表貼上">
            <textarea
              className="field-input min-h-[64px] resize-y font-mono text-[11px]"
              placeholder="第一欄是名稱，其餘每一欄各是一組數列。從試算表複製後直接貼在這裡"
              onPaste={(e) => {
                const parsed = parsePastedSeries(e.clipboardData.getData('text'));
                if (!parsed) return;
                e.preventDefault();
                update({ labels: parsed.labels, series: parsed.series, values: undefined });
                e.currentTarget.value = '';
                editorStore.toast({
                  tone: 'success',
                  title: `已帶入 ${parsed.labels.length} 筆資料`,
                  detail:
                    parsed.series.length > 1 ? `共 ${parsed.series.length} 組數列` : undefined,
                });
              }}
              onChange={() => {}}
            />
          </Field>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[11px] text-ink-3">資料</span>
              <div className="flex gap-1">
                <button
                  type="button"
                  className="tool-btn px-1.5 py-0.5 text-[10px]"
                  title="依第一組數列由大到小排序"
                  onClick={() => {
                    const next = sortSeriesRows(el.labels, seriesOf(el), 'desc');
                    update({ labels: next.labels, series: next.series, values: undefined });
                  }}
                >
                  大到小
                </button>
                <button
                  type="button"
                  className="tool-btn px-1.5 py-0.5 text-[10px]"
                  title="依第一組數列由小到大排序"
                  onClick={() => {
                    const next = sortSeriesRows(el.labels, seriesOf(el), 'asc');
                    update({ labels: next.labels, series: next.series, values: undefined });
                  }}
                >
                  小到大
                </button>
              </div>
            </div>

            {seriesOf(el).length > 1 && (
              <div className="mb-1.5 space-y-1">
                {seriesOf(el).map((s, si) => (
                  <div key={si} className="flex items-center gap-1">
                    <span
                      className="h-4 w-4 shrink-0 rounded"
                      style={{ background: el.colors[si % el.colors.length] }}
                      aria-hidden="true"
                    />
                    <input
                      className="field-input flex-1 text-[11px]"
                      aria-label={`第 ${si + 1} 組數列的名稱`}
                      placeholder={`數列 ${si + 1}`}
                      value={s.name}
                      onChange={(e) => {
                        const series = seriesOf(el).map((item, k) =>
                          k === si ? { ...item, name: e.target.value } : item,
                        );
                        update({ series, values: undefined });
                      }}
                    />
                    <button
                      type="button"
                      className="tool-btn px-1.5"
                      aria-label={`刪除第 ${si + 1} 組數列`}
                      disabled={seriesOf(el).length <= 1}
                      onClick={() =>
                        update({
                          series: seriesOf(el).filter((_, k) => k !== si),
                          values: undefined,
                        })
                      }
                    >
                      <Icon name="trash" size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-1">
              {el.labels.map((label, i) => (
                <div key={i} className="flex items-center gap-1">
                  <div className="flex flex-col">
                    <button
                      type="button"
                      className="tool-btn px-1 py-0"
                      aria-label={`把第 ${i + 1} 筆往上移`}
                      disabled={i === 0}
                      onClick={() => {
                        const next = moveSeriesRow(el.labels, seriesOf(el), i, -1);
                        update({ labels: next.labels, series: next.series, values: undefined });
                      }}
                    >
                      <Icon name="up" size={11} />
                    </button>
                    <button
                      type="button"
                      className="tool-btn px-1 py-0"
                      aria-label={`把第 ${i + 1} 筆往下移`}
                      disabled={i === el.labels.length - 1}
                      onClick={() => {
                        const next = moveSeriesRow(el.labels, seriesOf(el), i, 1);
                        update({ labels: next.labels, series: next.series, values: undefined });
                      }}
                    >
                      <Icon name="down" size={11} />
                    </button>
                  </div>
                  <input
                    className="field-input min-w-0 flex-1"
                    aria-label={`第 ${i + 1} 筆的名稱`}
                    value={label}
                    onChange={(e) => {
                      const labels = [...el.labels];
                      labels[i] = e.target.value;
                      update({ labels });
                    }}
                  />
                  {seriesOf(el).map((s, si) => (
                    <input
                      key={si}
                      type="number"
                      className="field-input w-[64px]"
                      aria-label={
                        seriesOf(el).length > 1
                          ? `第 ${i + 1} 筆在第 ${si + 1} 組的數值`
                          : `第 ${i + 1} 筆的數值`
                      }
                      value={Number.isFinite(s.values[i]) ? s.values[i] : 0}
                      onChange={(e) => {
                        const series = seriesOf(el).map((item, k) => {
                          const values = el.labels.map((_, n) =>
                            Number.isFinite(item.values[n]) ? item.values[n] : 0,
                          );
                          if (k === si) values[i] = Number(e.target.value);
                          return { ...item, values };
                        });
                        update({ series, values: undefined });
                      }}
                    />
                  ))}
                  <button
                    type="button"
                    className="tool-btn px-1.5"
                    aria-label={`在第 ${i + 1} 筆後面插入一列`}
                    title="在下面插入一列"
                    onClick={() => {
                      const next = insertSeriesRow(el.labels, seriesOf(el), i + 1);
                      update({ labels: next.labels, series: next.series, values: undefined });
                    }}
                  >
                    ＋
                  </button>
                  <button
                    type="button"
                    className="tool-btn px-1.5"
                    aria-label={`刪除第 ${i + 1} 筆`}
                    disabled={el.labels.length <= 1}
                    onClick={() =>
                      update({
                        labels: el.labels.filter((_, k) => k !== i),
                        series: seriesOf(el).map((s) => ({
                          ...s,
                          values: el.labels
                            .map((_, n) => (Number.isFinite(s.values[n]) ? s.values[n] : 0))
                            .filter((_, n) => n !== i),
                        })),
                        values: undefined,
                      })
                    }
                  >
                    <Icon name="trash" size={13} />
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-1.5 flex gap-1.5">
              <button
                type="button"
                className="tool-btn flex-1 justify-center"
                onClick={() => {
                  const next = insertSeriesRow(el.labels, seriesOf(el), el.labels.length);
                  next.labels[next.labels.length - 1] = `項目 ${next.labels.length}`;
                  update({ labels: next.labels, series: next.series, values: undefined });
                }}
              >
                ＋ 新增一筆
              </button>
              <button
                type="button"
                className="tool-btn flex-1 justify-center"
                title="同一張圖再放一組資料（圓餅圖只看第一組）"
                onClick={() =>
                  update({
                    series: [
                      ...seriesOf(el),
                      {
                        name: `數列 ${seriesOf(el).length + 1}`,
                        values: el.labels.map(() => 0),
                      },
                    ],
                    values: undefined,
                  })
                }
              >
                ＋ 新增數列
              </button>
            </div>
          </div>

          <div className="flex gap-1">
            <ToggleButton
              active={el.showValues}
              onClick={() => update({ showValues: !el.showValues })}
              title="在圖上標出數值"
            >
              <span className="text-[11px]">顯示數值</span>
            </ToggleButton>
            <ToggleButton
              active={el.showLegend}
              onClick={() => update({ showLegend: !el.showLegend })}
              title="顯示圖例"
            >
              <span className="text-[11px]">顯示圖例</span>
            </ToggleButton>
          </div>

          <FontSelect value={el.fontFamily} onChange={(stack) => update({ fontFamily: stack })} />
          <div className="grid grid-cols-2 gap-2">
            <Field label="字級">
              <NumberInput
                value={el.fontSize}
                min={1}
                onChange={(v) => v > 0 && update({ fontSize: v })}
                suffix="px"
              />
            </Field>
            <Field label="文字顏色">
              <ColorInput value={el.color} onChange={(v) => update({ color: v })} />
            </Field>
          </div>
          <Field label="格線顏色">
            <ColorInput value={el.gridColor} onChange={(v) => update({ gridColor: v })} />
          </Field>
          <div>
            <span className="mb-1 block text-[11px] text-ink-3">資料顏色（依序使用，用完循環）</span>
            <div className="flex flex-wrap gap-1">
              {el.colors.map((color, i) => (
                <input
                  key={i}
                  type="color"
                  aria-label={`第 ${i + 1} 個顏色`}
                  className="h-7 w-8 cursor-pointer rounded-md border"
                  style={{ borderColor: 'var(--color-line)', background: 'transparent' }}
                  value={/^#[0-9a-f]{6}$/i.test(color) ? color : '#000000'}
                  onChange={(e) => {
                    const colors = [...el.colors];
                    colors[i] = e.target.value;
                    update({ colors });
                  }}
                />
              ))}
            </div>
          </div>
          <p className="text-[11px] leading-snug text-ink-3">
            圓餅圖只會用第一組數列。橫向長條圖適合項目名稱較長的情況。
          </p>
        </Section>
      )}

      {!multi && el.type === 'table' && (
        <Section title="表格" icon="grid">
          <div className="grid grid-cols-2 gap-2">
            <Field label={`列數（${el.cells.length}）`}>
              <div className="flex gap-1">
                <button
                  type="button"
                  className="tool-btn flex-1 justify-center"
                  onClick={() => update({ cells: insertTableRow(el, el.cells.length).cells })}
                >
                  ＋
                </button>
                <button
                  type="button"
                  className="tool-btn flex-1 justify-center"
                  disabled={el.cells.length <= 1}
                  onClick={() => update({ cells: removeTableRow(el, el.cells.length - 1).cells })}
                >
                  －
                </button>
              </div>
            </Field>
            <Field label={`欄數（${el.cells[0]?.length ?? 0}）`}>
              <div className="flex gap-1">
                <button
                  type="button"
                  className="tool-btn flex-1 justify-center"
                  onClick={() => {
                    const next = insertTableColumn(el, el.cells[0]?.length ?? 0);
                    update({ cells: next.cells, columnWidths: next.columnWidths });
                  }}
                >
                  ＋
                </button>
                <button
                  type="button"
                  className="tool-btn flex-1 justify-center"
                  disabled={(el.cells[0]?.length ?? 0) <= 1}
                  onClick={() => {
                    const next = removeTableColumn(el, (el.cells[0]?.length ?? 1) - 1);
                    update({ cells: next.cells, columnWidths: next.columnWidths });
                  }}
                >
                  －
                </button>
              </div>
            </Field>
          </div>
          <div className="flex gap-1">
            <ToggleButton
              active={el.headerRow}
              onClick={() => update({ headerRow: !el.headerRow })}
              title="第一列當成標題列"
            >
              <span className="text-[11px]">標題列</span>
            </ToggleButton>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="字級">
              <NumberInput value={el.fontSize} min={1} onChange={(v) => v > 0 && update({ fontSize: v })} suffix="px" />
            </Field>
            <Field label="格內留白">
              <NumberInput value={el.cellPadding} min={0} onChange={(v) => update({ cellPadding: Math.max(0, v) })} suffix="px" />
            </Field>
          </div>
          <FontSelect value={el.fontFamily} onChange={(stack) => update({ fontFamily: stack })} />
          <Field label="文字顏色">
            <ColorInput value={el.color} onChange={(v) => update({ color: v })} />
          </Field>
          <Field label="框線顏色">
            <ColorInput value={el.borderColor} onChange={(v) => update({ borderColor: v })} />
          </Field>
          <Field label="標題列底色">
            <ColorInput value={el.headerFill} onChange={(v) => update({ headerFill: v })} />
          </Field>
          <p className="text-[11px] leading-snug text-ink-3">
            雙擊表格可以直接編輯每一格。這一版不支援儲存格合併。
          </p>
        </Section>
      )}

      {!multi && (el.type === 'rect' || el.type === 'ellipse' || el.type === 'shape') && (
        <Section title="圖形樣式" icon="square">
          {el.type === 'shape' && (
            <Field label="形狀">
              <select
                className="field-input"
                value={el.shape}
                onChange={(e) => update({ shape: e.target.value as ShapeKind })}
              >
                {SHAPE_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {SHAPE_LABELS[kind]}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="填色">
            <ColorInput value={el.fill} onChange={(v) => update({ fill: v })} />
          </Field>
          <Field label="邊框顏色">
            <ColorInput value={el.stroke} onChange={(v) => update({ stroke: v })} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="邊框粗細">
              <NumberInput value={el.strokeWidth} min={0} onChange={(v) => update({ strokeWidth: Math.max(0, v) })} suffix="px" />
            </Field>
            {el.type === 'rect' && (
              <Field label="圓角">
                <NumberInput value={el.radius} min={0} onChange={(v) => update({ radius: Math.max(0, v) })} suffix="px" />
              </Field>
            )}
          </div>
        </Section>
      )}

      {!multi && el.type === 'line' && (
        <Section title="線條樣式" icon="line">
          <Field label="顏色">
            <ColorInput value={el.stroke} onChange={(v) => update({ stroke: v })} />
          </Field>
          <Field label="粗細">
            <NumberInput value={el.strokeWidth} min={1} onChange={(v) => update({ strokeWidth: Math.max(1, v) })} suffix="px" />
          </Field>
          <div className="flex gap-1.5">
            <ToggleButton
              active={el.arrowStart === true}
              onClick={() => update({ arrowStart: !el.arrowStart })}
              title="左端箭頭"
            >
              左箭頭
            </ToggleButton>
            <ToggleButton
              active={el.arrowEnd === true}
              onClick={() => update({ arrowEnd: !el.arrowEnd })}
              title="右端箭頭"
            >
              右箭頭
            </ToggleButton>
          </div>
        </Section>
      )}

      {!multi && el.type === 'image' && (
        <Section title="圖片" icon="image">
          <button
            type="button"
            className="tool-btn w-full justify-center"
            style={{ background: 'var(--color-panel-2)', border: '1px solid var(--color-line)' }}
            onClick={async () => {
              const picked = await pickImageFile();
              if (picked) update({ src: picked.dataUrl, alt: picked.name });
            }}
          >
            <Icon name="upload" size={14} />
            {el.src ? '更換圖片' : '選擇圖片'}
          </button>
          <Field label="替代文字">
            <input className="field-input" value={el.alt} onChange={(e) => update({ alt: e.target.value })} />
          </Field>
          <Field label="填滿方式">
            <select className="field-input" value={el.fit} onChange={(e) => update({ fit: e.target.value })}>
              <option value="contain">完整顯示</option>
              <option value="cover">裁切填滿</option>
              <option value="fill">拉伸填滿</option>
            </select>
          </Field>
          <Field label="圓角">
            <NumberInput value={el.radius} min={0} onChange={(v) => update({ radius: Math.max(0, v) })} suffix="px" />
          </Field>
          <CropFields
            crop={el.crop}
            onChange={(crop) => update({ crop })}
          />
        </Section>
      )}

      {!multi && el.type === 'ai_component' && <AiSettings el={el} />}
    </>
  );
}

/**
 * 圖片裁切的四個邊。
 *
 * 用「各邊要裁掉多少百分比」來填，比直接填 x/y/寬/高 好懂：
 * 使用者想的是「左邊切掉一點」，不是「保留 0.1 到 0.9」。
 */
function CropFields({
  crop,
  onChange,
}: {
  crop: ImageCrop | undefined;
  onChange: (crop: ImageCrop | undefined) => void;
}) {
  const current = normalizeCrop(crop);
  const left = Math.round(current.x * 100);
  const top = Math.round(current.y * 100);
  const right = Math.round((1 - current.x - current.w) * 100);
  const bottom = Math.round((1 - current.y - current.h) * 100);

  const apply = (next: { left: number; top: number; right: number; bottom: number }) => {
    const x = Math.min(95, Math.max(0, next.left)) / 100;
    const y = Math.min(95, Math.max(0, next.top)) / 100;
    const w = 1 - x - Math.min(95, Math.max(0, next.right)) / 100;
    const h = 1 - y - Math.min(95, Math.max(0, next.bottom)) / 100;
    if (w <= 0.02 || h <= 0.02) return;
    const value = { x, y, w, h };
    onChange(x === 0 && y === 0 && w === 1 && h === 1 ? undefined : value);
  };

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Field label="左邊裁掉">
          <NumberInput
            value={left}
            min={0}
            onChange={(v) => apply({ left: v, top, right, bottom })}
            suffix="%"
          />
        </Field>
        <Field label="右邊裁掉">
          <NumberInput
            value={right}
            min={0}
            onChange={(v) => apply({ left, top, right: v, bottom })}
            suffix="%"
          />
        </Field>
        <Field label="上面裁掉">
          <NumberInput
            value={top}
            min={0}
            onChange={(v) => apply({ left, top: v, right, bottom })}
            suffix="%"
          />
        </Field>
        <Field label="下面裁掉">
          <NumberInput
            value={bottom}
            min={0}
            onChange={(v) => apply({ left, top, right, bottom: v })}
            suffix="%"
          />
        </Field>
      </div>
      {(left > 0 || top > 0 || right > 0 || bottom > 0) && (
        <button
          type="button"
          className="tool-btn w-full justify-center"
          style={{ background: 'var(--color-panel-2)', border: '1px solid var(--color-line)' }}
          onClick={() => onChange(undefined)}
        >
          取消裁切
        </button>
      )}
    </>
  );
}

export function Inspector() {
  const state = useEditorState();
  const slide = state.masterMode
    ? state.presentation.masters?.[state.masterMode]
    : state.presentation.slides.find((s) => s.id === state.currentSlideId);
  const selected = (slide?.elements ?? []).filter((el) => state.selectedIds.includes(el.id));

  return (
    <div className="h-full overflow-y-auto">
      {selected.length === 0 ? <SlideInspector /> : <ElementInspector elements={selected} />}
    </div>
  );
}
