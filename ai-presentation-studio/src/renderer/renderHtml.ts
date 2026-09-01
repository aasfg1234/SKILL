import { escapeHtml } from '../model/sanitize';
import type { Presentation } from '../model/types';
import { renderElementToHtml, sortedElements } from './renderElement';

/**
 * Presentation Specification → 單一自足 HTML 檔。
 *
 * 產出的檔案不依賴 npm、Node.js、Server、CDN 或任何遠端資源，
 * 直接以瀏覽器開啟即可播放。
 */

export interface RenderOptions {
  /** 是否顯示右下角的頁碼與控制列 */
  showControls?: boolean;
  /** 是否在標題列附註這是 AI Presentation Studio 匯出的檔案 */
  includeBranding?: boolean;
}

function baseCss(p: Presentation): string {
  const { width, height } = p.settings;
  const theme = p.theme;
  return `
*,*::before,*::after{box-sizing:border-box;}
html,body{margin:0;padding:0;height:100%;background:#0B0D10;}
body{
  font-family:${theme.fontFamily};
  color:${theme.palette.text};
  overflow:hidden;
  -webkit-font-smoothing:antialiased;
}
#aps-viewport{
  position:fixed;inset:0;display:flex;align-items:center;justify-content:center;
}
#aps-stage{
  width:${width}px;height:${height}px;position:relative;
  transform-origin:center center;
  box-shadow:0 24px 80px rgba(0,0,0,.45);
}
.aps-slide{
  position:absolute;inset:0;overflow:hidden;display:none;
  background:${theme.palette.background};
}
.aps-slide.is-active{display:block;}
.aps-el{position:absolute;}
.aps-ai{overflow:hidden;}
.aps-ai-completed{display:flex;align-items:center;justify-content:center;}
.aps-ai-svg,.aps-ai-html{width:100%;height:100%;display:flex;align-items:center;justify-content:center;}
.aps-ai-svg svg{width:100%;height:100%;display:block;}
.aps-ai-image{width:100%;height:100%;object-fit:contain;display:block;}
.aps-ai-text{width:100%;height:100%;display:flex;flex-direction:column;justify-content:center;
  font-size:36px;line-height:1.6;color:${theme.palette.text};}
.aps-ai-json{width:100%;height:100%;overflow:auto;font-size:20px;
  font-family:ui-monospace,Consolas,monospace;background:${theme.palette.surface};
  border-radius:12px;padding:24px;margin:0;}
.aps-ai-placeholder{
  width:100%;height:100%;border:3px dashed ${theme.palette.primary};
  border-radius:20px;background:rgba(79,70,229,.05);
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;
  padding:40px;text-align:center;
}
.aps-ai-error .aps-ai-placeholder{border-color:#DC2626;background:rgba(220,38,38,.05);}
.aps-ai-badge{
  font-size:26px;font-weight:700;color:${theme.palette.primary};
  border:2px solid ${theme.palette.primary};border-radius:999px;padding:8px 24px;
}
.aps-ai-status{font-size:40px;font-weight:700;color:${theme.palette.text};}
.aps-ai-prompt{font-size:24px;color:${theme.palette.muted};max-width:80%;line-height:1.6;}

#aps-bar{
  position:fixed;left:0;right:0;bottom:0;height:56px;
  display:flex;align-items:center;justify-content:space-between;gap:16px;
  padding:0 20px;color:#E5E7EB;font-size:14px;
  background:linear-gradient(to top,rgba(0,0,0,.65),rgba(0,0,0,0));
  opacity:.35;transition:opacity .2s;
}
#aps-bar:hover,body:hover #aps-bar{opacity:1;}
#aps-bar button{
  font:inherit;color:#E5E7EB;background:rgba(255,255,255,.1);
  border:1px solid rgba(255,255,255,.18);border-radius:8px;
  padding:6px 14px;cursor:pointer;
}
#aps-bar button:hover{background:rgba(255,255,255,.2);}
#aps-counter{font-variant-numeric:tabular-nums;}
#aps-progress{
  position:fixed;left:0;bottom:0;height:3px;background:${theme.palette.primary};
  width:0;transition:width .2s;
}
#aps-hint{
  position:fixed;top:16px;left:50%;transform:translateX(-50%);
  color:rgba(229,231,235,.75);font-size:13px;letter-spacing:.02em;
  background:rgba(0,0,0,.35);border-radius:999px;padding:6px 16px;
  transition:opacity .4s;
}
@media print{
  html,body{background:#fff;}
  #aps-bar,#aps-hint,#aps-progress{display:none;}
  .aps-slide{display:block;position:relative;page-break-after:always;}
  #aps-stage{transform:none !important;box-shadow:none;height:auto;}
}
`.trim();
}

function navigationScript(total: number): string {
  return `
(function(){
  var slides = Array.prototype.slice.call(document.querySelectorAll('.aps-slide'));
  var total = ${total};
  var stage = document.getElementById('aps-stage');
  var counter = document.getElementById('aps-counter');
  var progress = document.getElementById('aps-progress');
  var hint = document.getElementById('aps-hint');
  var index = 0;

  function hashIndex(){
    var m = /^#slide-(\\d+)$/.exec(window.location.hash || '');
    if (!m) return 0;
    var n = parseInt(m[1], 10) - 1;
    return (isNaN(n) || n < 0 || n >= total) ? 0 : n;
  }

  function render(){
    slides.forEach(function(s, i){ s.classList.toggle('is-active', i === index); });
    if (counter) counter.textContent = '第 ' + (index + 1) + ' / ' + total + ' 頁';
    if (progress) progress.style.width = (total > 1 ? (index / (total - 1)) * 100 : 100) + '%';
    var h = '#slide-' + (index + 1);
    if (window.location.hash !== h) history.replaceState(null, '', h);
  }

  function go(next){
    if (next < 0 || next >= total) return;
    index = next;
    render();
  }

  function fit(){
    var k = Math.min(window.innerWidth / stage.offsetWidth, window.innerHeight / stage.offsetHeight);
    stage.style.transform = 'scale(' + k + ')';
  }

  function toggleFullscreen(){
    if (document.fullscreenElement) { document.exitFullscreen(); }
    else if (document.documentElement.requestFullscreen) { document.documentElement.requestFullscreen(); }
  }

  document.addEventListener('keydown', function(e){
    switch (e.key) {
      case 'ArrowRight': case 'PageDown': go(index + 1); e.preventDefault(); break;
      case ' ': case 'Spacebar': go(index + 1); e.preventDefault(); break;
      case 'ArrowLeft': case 'PageUp': go(index - 1); e.preventDefault(); break;
      case 'Home': go(0); e.preventDefault(); break;
      case 'End': go(total - 1); e.preventDefault(); break;
      case 'f': case 'F': toggleFullscreen(); e.preventDefault(); break;
      case 'Escape':
        if (document.fullscreenElement) { document.exitFullscreen(); }
        break;
      default: break;
    }
  });

  var prev = document.getElementById('aps-prev');
  var next = document.getElementById('aps-next');
  var full = document.getElementById('aps-full');
  if (prev) prev.addEventListener('click', function(){ go(index - 1); });
  if (next) next.addEventListener('click', function(){ go(index + 1); });
  if (full) full.addEventListener('click', toggleFullscreen);

  window.addEventListener('resize', fit);
  window.addEventListener('hashchange', function(){ go(hashIndex()); });

  index = hashIndex();
  fit();
  render();
  if (hint) { setTimeout(function(){ hint.style.opacity = '0'; }, 3200); }
})();
`.trim();
}

/** 產生 final-presentation.html 的完整內容。 */
export function renderPresentationToHtml(
  presentation: Presentation,
  options: RenderOptions = {},
): string {
  const { showControls = true, includeBranding = true } = options;
  const slidesHtml = presentation.slides
    .map((slide, i) => {
      const body = sortedElements(slide.elements).map(renderElementToHtml).join('\n      ');
      return `    <section class="aps-slide${i === 0 ? ' is-active' : ''}" id="aps-slide-${escapeHtml(
        slide.id,
      )}" data-index="${i + 1}" aria-label="${escapeHtml(slide.title)}" style="background:${escapeHtml(
        slide.background,
      )}">
      ${body}
    </section>`;
    })
    .join('\n');

  const controls = showControls
    ? `  <div id="aps-bar">
    <div>
      <button id="aps-prev" type="button">← 上一頁</button>
      <button id="aps-next" type="button">下一頁 →</button>
      <button id="aps-full" type="button">F 全螢幕</button>
    </div>
    <div id="aps-counter">第 1 / ${presentation.slides.length} 頁</div>
  </div>
  <div id="aps-progress"></div>
  <div id="aps-hint">← → 換頁　空白鍵下一頁　F 全螢幕　Esc 離開全螢幕</div>`
    : '';

  const branding = includeBranding
    ? `  <!-- 由 AI Presentation Studio 匯出（protocol: ${presentation.protocol}, 規格版本 ${presentation.version}） -->`
    : '';

  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(presentation.metadata.title)}</title>
<meta name="description" content="${escapeHtml(presentation.metadata.description)}" />
<style>
${baseCss(presentation)}
</style>
</head>
<body>
${branding}
<div id="aps-viewport">
  <div id="aps-stage">
${slidesHtml}
  </div>
</div>
${controls}
<script>
${navigationScript(presentation.slides.length)}
</${''}script>
</body>
</html>
`;
}
