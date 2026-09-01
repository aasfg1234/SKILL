import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { createDemoPresentation } from '../model/demo';
import {
  applyPatch,
  createPatchTemplate,
  mergeCompletedPresentation,
} from '../model/patch';
import { buildMockCompletedPresentation, buildMockPatch } from '../handoff/mockAi';
import { buildAiPackageZip, buildPackageFiles, PACKAGE_ROOT } from '../handoff/package';
import { PATCH_PROTOCOL, type PresentationPatch } from '../model/types';
import { validatePresentation } from '../model/validator';

const SVG = '<svg viewBox="0 0 1640 620" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="50" fill="#4F46E5"/><text x="10" y="30">2026 營收</text></svg>';

function aiElement(p: ReturnType<typeof createDemoPresentation>, id: string) {
  for (const slide of p.slides) {
    const el = slide.elements.find((e) => e.id === id);
    if (el && el.type === 'ai_component') return el;
  }
  throw new Error(`找不到 AI 元件 ${id}`);
}

describe('最重要的驗收測試：TASK-001 → slide-02 / ai-chart-001', () => {
  it('AI 輸出被寫入正確的投影片與元素，且位置尺寸不變', () => {
    const before = createDemoPresentation();
    const target = aiElement(before, 'ai-chart-001');
    const geometry = { x: target.x, y: target.y, width: target.width, height: target.height };

    const patch: PresentationPatch = {
      protocol: PATCH_PROTOCOL,
      operations: [
        {
          operation: 'replace_ai_output',
          taskId: 'TASK-001',
          targetElementId: 'ai-chart-001',
          output: { type: 'svg', content: SVG },
        },
      ],
    };

    const { presentation: after, summary } = applyPatch(before, patch);

    expect(summary.status).toBe('success');
    expect(summary.applied).toBe(1);

    // 正確 slide
    const slide = after.slides.find((s) => s.id === 'slide-02');
    expect(slide).toBeDefined();
    expect(slide?.elements.some((e) => e.id === 'ai-chart-001')).toBe(true);

    // 正確 element、正確狀態與內容
    const updated = aiElement(after, 'ai-chart-001');
    expect(updated.status).toBe('completed');
    expect(updated.result?.type).toBe('svg');
    expect(updated.result?.content).toContain('<svg');
    expect(updated.result?.content).toContain('2026 營收');

    // 正確 x / y / width / height
    expect({
      x: updated.x,
      y: updated.y,
      width: updated.width,
      height: updated.height,
    }).toEqual(geometry);

    // aiTasks 同步更新
    const task = after.aiTasks.find((t) => t.id === 'TASK-001');
    expect(task?.status).toBe('completed');
    expect(task?.target).toEqual({ slideId: 'slide-02', elementId: 'ai-chart-001' });
  });

  it('其他元素與其他 AI 任務完全沒有被修改', () => {
    const before = createDemoPresentation();
    const snapshot = new Map(
      before.slides.flatMap((s) =>
        s.elements
          .filter((e) => e.id !== 'ai-chart-001')
          .map((e) => [e.id, JSON.stringify(e)] as const),
      ),
    );

    const { presentation: after } = applyPatch(before, {
      protocol: PATCH_PROTOCOL,
      operations: [
        {
          operation: 'replace_ai_output',
          taskId: 'TASK-001',
          targetElementId: 'ai-chart-001',
          output: { type: 'svg', content: SVG },
        },
      ],
    });

    for (const slide of after.slides) {
      for (const el of slide.elements) {
        if (el.id === 'ai-chart-001') continue;
        expect(JSON.stringify(el)).toBe(snapshot.get(el.id));
      }
    }
    expect(after.slides.map((s) => s.id)).toEqual(before.slides.map((s) => s.id));
    expect(after.aiTasks.filter((t) => t.status === 'pending')).toHaveLength(3);
  });
});

describe('Patch 協定', () => {
  it('拒絕協定不符的 Patch', () => {
    const p = createDemoPresentation();
    const { presentation, summary } = applyPatch(p, {
      protocol: 'wrong/v1',
      operations: [],
    } as unknown as PresentationPatch);
    expect(summary.status).toBe('failed');
    expect(presentation).toBe(p);
  });

  it('拒絕把 AI 結果寫進非 AI 元件', () => {
    const p = createDemoPresentation();
    const { summary } = applyPatch(p, {
      protocol: PATCH_PROTOCOL,
      operations: [
        {
          operation: 'replace_ai_output',
          taskId: 'TASK-001',
          targetElementId: 'el-cover-title',
          output: { type: 'svg', content: SVG },
        },
      ],
    });
    expect(summary.failed).toBe(1);
    expect(summary.details[0].message).toContain('不是 AI 元件');
  });

  it('略過已鎖定的元素', () => {
    const p = createDemoPresentation();
    aiElement(p, 'ai-chart-001').locked = true;
    const { summary } = applyPatch(p, {
      protocol: PATCH_PROTOCOL,
      operations: [
        {
          operation: 'replace_ai_output',
          taskId: 'TASK-001',
          targetElementId: 'ai-chart-001',
          output: { type: 'svg', content: SVG },
        },
      ],
    });
    expect(summary.skipped).toBe(1);
  });

  it('支援 add_element / update_element / delete_element', () => {
    const p = createDemoPresentation();
    const { presentation, summary } = applyPatch(p, {
      protocol: PATCH_PROTOCOL,
      operations: [
        {
          operation: 'add_element',
          slideId: 'slide-01',
          element: {
            id: 'el-new-001',
            type: 'rect',
            x: 10,
            y: 10,
            width: 100,
            height: 100,
            rotation: 0,
            opacity: 1,
            locked: false,
            hidden: false,
            z: 9,
            fill: '#000000',
            stroke: '#000000',
            strokeWidth: 0,
            radius: 0,
          },
        },
        { operation: 'update_element', elementId: 'el-new-001', props: { x: 50 } },
        { operation: 'delete_element', elementId: 'el-cover-line' },
      ],
    });
    expect(summary.applied).toBe(3);
    const slide = presentation.slides[0];
    expect(slide.elements.find((e) => e.id === 'el-new-001')?.x).toBe(50);
    expect(slide.elements.some((e) => e.id === 'el-cover-line')).toBe(false);
  });

  it('Patch 範本會列出所有待處理任務', () => {
    const template = createPatchTemplate(createDemoPresentation());
    expect(template.protocol).toBe(PATCH_PROTOCOL);
    expect(template.operations).toHaveLength(4);
    expect(template.operations[0]).toMatchObject({
      operation: 'replace_ai_output',
      taskId: 'TASK-001',
      targetElementId: 'ai-chart-001',
    });
  });
});

describe('匯入 Completed Presentation', () => {
  it('套用外部 AI 完成的整份規格，並保留非 AI 元件', () => {
    const current = createDemoPresentation();
    const completed = buildMockCompletedPresentation(createDemoPresentation());

    // 外部 AI 擅自改動了非 AI 元件
    const coverTitle = completed.slides[0].elements.find((e) => e.id === 'el-cover-title');
    if (coverTitle && coverTitle.type === 'text') coverTitle.text = '被竄改的標題';

    const { presentation, summary } = mergeCompletedPresentation(current, completed);

    expect(summary.status).toBe('success');
    expect(summary.applied).toBe(4);
    const title = presentation.slides[0].elements.find((e) => e.id === 'el-cover-title');
    expect(title && title.type === 'text' ? title.text : '').toBe('2026 AI 科技趨勢');
    expect(presentation.aiTasks.every((t) => t.status === 'completed')).toBe(true);
  });

  it('部分完成：3 個成功、1 個失敗時仍保留整份簡報', () => {
    const current = createDemoPresentation();
    const completed = buildMockCompletedPresentation(createDemoPresentation());
    const failing = completed.slides[4].elements.find((e) => e.type === 'ai_component');
    if (failing && failing.type === 'ai_component') {
      failing.status = 'error';
      failing.errorMessage = '資料不足，無法產生資訊圖表';
      delete failing.result;
    }
    completed.aiTasks = completed.aiTasks.map((t) =>
      t.target.elementId === 'ai-infographic-001'
        ? { ...t, status: 'error' as const, errorMessage: '資料不足，無法產生資訊圖表', result: undefined }
        : t,
    );

    const { presentation, summary } = mergeCompletedPresentation(current, completed);
    expect(summary.status).toBe('partial');
    expect(summary.applied).toBe(3);
    expect(summary.failed).toBe(1);
    expect(presentation.slides).toHaveLength(5);

    const errored = presentation.aiTasks.find((t) => t.target.elementId === 'ai-infographic-001');
    expect(errored?.status).toBe('error');
    expect(errored?.errorMessage).toContain('資料不足');
  });

  it('拒絕 slideId 與 elementId 不匹配的結果', () => {
    const current = createDemoPresentation();
    const completed = buildMockCompletedPresentation(createDemoPresentation());
    completed.aiTasks[0].target.slideId = 'slide-03';
    const { summary } = mergeCompletedPresentation(current, completed);
    expect(summary.failed).toBeGreaterThan(0);
    expect(summary.details.some((d) => d.message.includes('拒絕套用'))).toBe(true);
  });
});

describe('模擬 AI（Demo）', () => {
  it('產生的每個結果都標示為模擬資料', () => {
    const p = createDemoPresentation();
    const patch = buildMockPatch(p);
    expect(patch.operations).toHaveLength(4);
    for (const op of patch.operations) {
      if (op.operation !== 'replace_ai_output') continue;
      expect(op.output.producer).toBe('mock-simulator');
      expect(op.output.content).toContain('模擬資料');
    }
  });

  it('模擬完成後整份簡報仍通過驗證', () => {
    const p = createDemoPresentation();
    const { presentation } = applyPatch(p, buildMockPatch(p));
    const report = validatePresentation(presentation);
    expect(report.status).toBe('success');
    expect(report.aiTasks.completed).toBe(4);
    expect(report.aiTasks.pending).toBe(0);
  });
});

describe('AI Handoff Package', () => {
  it('包含 AI-INSTRUCTIONS.md、presentation.json、README.md、assets 與 output', () => {
    const files = buildPackageFiles(createDemoPresentation());
    const names = Object.keys(files.text);
    expect(names).toContain('AI-INSTRUCTIONS.md');
    expect(names).toContain('presentation.json');
    expect(names).toContain('README.md');
    expect(names).toContain('patch-template.json');
    expect(names).toContain('validation-report.json');
    expect(names).toContain('assets/images/manifest.json');
    expect(names).toContain('assets/fonts/README.md');
    expect(names).toContain('output/README.md');
  });

  it('AI-INSTRUCTIONS.md 明確列出任務、目標與限制', () => {
    const files = buildPackageFiles(createDemoPresentation());
    const md = files.text['AI-INSTRUCTIONS.md'];
    expect(md).toContain('TASK-001');
    expect(md).toContain('slide-02');
    expect(md).toContain('ai-chart-001');
    expect(md).toContain('不得修改任何非 AI 元件');
    expect(md).toContain('completed-presentation.json');
    expect(md).toContain('ai-presentation-patch/v1');
  });

  it('presentation.json 內容可以被重新解析', () => {
    const files = buildPackageFiles(createDemoPresentation());
    const parsed = JSON.parse(files.text['presentation.json']);
    expect(parsed.protocol).toBe('ai-presentation/v1');
    expect(parsed.slides).toHaveLength(5);
  });

  it('ZIP 實際可以產生，且結構正確', async () => {
    const blob = await buildAiPackageZip(createDemoPresentation());
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const paths = Object.keys(zip.files);
    expect(paths).toContain(`${PACKAGE_ROOT}/AI-INSTRUCTIONS.md`);
    expect(paths).toContain(`${PACKAGE_ROOT}/presentation.json`);
    expect(paths).toContain(`${PACKAGE_ROOT}/README.md`);
    expect(paths).toContain(`${PACKAGE_ROOT}/output/README.md`);

    const json = await zip.file(`${PACKAGE_ROOT}/presentation.json`)!.async('string');
    expect(JSON.parse(json).aiTasks).toHaveLength(4);
  });
});
