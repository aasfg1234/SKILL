import { escapeHtml } from '../model/sanitize';
import type { Presentation } from '../model/types';
import { renderElementToHtml, sortedElements } from './renderElement';
import { elementsForPresenting } from '../model/presenting';
import { effectiveSlideBackground, masterForSlide } from '../model/master';
import { isSlideHidden, slideNumberFor } from '../model/deck';

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
  flex:0 0 auto;
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
#aps-presenter-inline{
  position:fixed;right:16px;bottom:72px;width:380px;max-height:60vh;
  display:flex;flex-direction:column;gap:10px;overflow:auto;
  padding:16px 18px;border-radius:14px;color:#E5E7EB;font-size:14px;
  background:rgba(15,17,21,.94);border:1px solid rgba(255,255,255,.14);
  box-shadow:0 18px 48px rgba(0,0,0,.5);
}
#aps-presenter-inline[hidden]{display:none;}
.aps-p-head{display:flex;align-items:center;justify-content:space-between;gap:12px;}
#aps-p-timer{font-variant-numeric:tabular-nums;font-size:20px;font-weight:700;}
.aps-p-meta{font-size:12.5px;color:rgba(229,231,235,.7);}
.aps-p-notes{
  flex:1;white-space:pre-wrap;line-height:1.7;font-size:15px;
  border-top:1px solid rgba(255,255,255,.14);padding-top:10px;
}
.aps-p-foot{font-size:11.5px;line-height:1.6;color:rgba(229,231,235,.5);}

@media print{
  html,body{background:#fff;}
  #aps-bar,#aps-hint,#aps-progress,#aps-presenter-inline{display:none;}
  .aps-slide{display:block;position:relative;page-break-after:always;}
  #aps-stage{transform:none !important;box-shadow:none;height:auto;}
}
`.trim();
}

function navigationScript(total: number, width: number, height: number): string {
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
    updatePresenter();
  }

  /* 講者檢視 -------------------------------------------------------- */
  var inline = document.getElementById('aps-presenter-inline');
  var presenterWin = null;
  var presenterOn = false;
  var presenterFontScale = 0.5;
  var startedAt = Date.now();
  var timerId = null;

  function slideInfo(i){
    var s = slides[i];
    if (!s) return null;
    return { title: s.getAttribute('data-title') || '', notes: s.getAttribute('data-notes') || '' };
  }

  function pad2(n){ return (n < 10 ? '0' : '') + n; }

  function elapsedText(){
    var ms = Date.now() - startedAt;
    var sec = Math.floor((ms > 0 ? ms : 0) / 1000);
    var h = Math.floor(sec / 3600);
    var m = Math.floor((sec % 3600) / 60);
    var r = sec % 60;
    return h > 0 ? h + ':' + pad2(m) + ':' + pad2(r) : pad2(m) + ':' + pad2(r);
  }

  function writeShell(doc){
    doc.open();
    doc.write(
      '<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8" />' +
      '<title>講者檢視</title><style>' +
      ':root{--p-font-scale:.5;}' +
      'html,body{margin:0;height:100%;background:#0F1115;color:#E5E7EB;' +
      'font-family:Arial,"Microsoft JhengHei","PingFang TC",sans-serif;}' +
      '.wrap{display:grid;grid-template-rows:auto minmax(0,1fr) auto;width:100%;height:100%;padding:16px;gap:12px;box-sizing:border-box;overflow:auto;}' +
      '.top{display:flex;align-items:center;justify-content:space-between;gap:12px;}' +
      '.head{min-width:0;}' +
      '.timer{font-size:calc(44px * var(--p-font-scale));font-weight:700;font-variant-numeric:tabular-nums;}' +
      '.counter{font-size:calc(16px * var(--p-font-scale));color:rgba(229,231,235,.7);}' +
      '.title{font-size:calc(22px * var(--p-font-scale));font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
      '.tools{display:flex;align-items:center;gap:6px;margin-left:auto;}' +
      '.tools button{min-width:34px;padding:5px 8px;border:1px solid rgba(255,255,255,.18);border-radius:7px;' +
      'background:rgba(255,255,255,.08);color:#E5E7EB;cursor:pointer;font-size:12px;}' +
      '.tools button:hover{background:rgba(255,255,255,.16);}' +
      '.level{min-width:38px;text-align:center;font-size:11px;color:rgba(229,231,235,.65);}' +
      '.main{display:flex;width:100%;flex-direction:column;align-items:stretch;gap:12px;min-height:0;}' +
      '.notes{overflow:auto;white-space:pre-wrap;line-height:1.8;font-size:calc(22px * var(--p-font-scale));' +
      'border-top:1px solid rgba(255,255,255,.15);padding-top:12px;flex:0 1 38%;width:100%;min-height:64px;box-sizing:border-box;}' +
      '.next-card{display:flex;width:100%;min-width:0;min-height:180px;flex:0 0 auto;flex-direction:column;gap:7px;padding:10px;border-radius:10px;box-sizing:border-box;' +
      'background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.12);}' +
      '.next{font-size:calc(15px * var(--p-font-scale));color:rgba(229,231,235,.75);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
      '.preview{display:block;width:100%;aspect-ratio:${width}/${height};flex:0 0 auto;border:0;border-radius:6px;background:#090A0D;pointer-events:none;}' +
      '.next-empty{display:flex;flex:1;align-items:center;justify-content:center;color:rgba(229,231,235,.45);font-size:12px;}' +
      '.next-empty[hidden]{display:none;}' +
      '.tip{font-size:10px;color:rgba(229,231,235,.45);}' +
      '@media(max-height:440px){.notes{flex-basis:30%}.next-card{min-height:140px}.tip{display:none}}' +
      '</style></head><body><div class="wrap">' +
      '<div class="top"><div class="head"><div class="counter" id="p-counter"></div>' +
      '<div class="title" id="p-title"></div></div>' +
      '<div class="tools" aria-label="字體大小"><button id="p-font-smaller" type="button" title="縮小字體">A−</button>' +
      '<span class="level" id="p-font-level">50%</span><button id="p-font-larger" type="button" title="放大字體">A＋</button></div>' +
      '<div class="timer" id="p-timer">00:00</div></div>' +
      '<div class="main"><div class="notes" id="p-notes"></div>' +
      '<div class="next-card"><div class="next" id="p-next"></div>' +
      '<iframe class="preview" id="p-next-preview" title="下一頁預覽"></iframe>' +
      '<div class="next-empty" id="p-next-empty" hidden>這是最後一頁</div></div></div>' +
      '<div class="tip">把這個視窗留在自己的螢幕，簡報視窗放到投影機並按 F 全螢幕。兩個視窗都可以用方向鍵換頁。</div>' +
      '</div></body></html>'
    );
    doc.close();
    var smaller = doc.getElementById('p-font-smaller');
    var larger = doc.getElementById('p-font-larger');
    if (smaller) smaller.addEventListener('click', function(){ changePresenterFont(doc, -0.1); });
    if (larger) larger.addEventListener('click', function(){ changePresenterFont(doc, 0.1); });
    applyPresenterFont(doc);
    if (doc.defaultView) {
      doc.defaultView.onresize = function(){
        doc.defaultView.requestAnimationFrame(function(){ refitNextPreview(doc); });
      };
    }
  }

  function setText(doc, id, value){
    var node = doc.getElementById(id);
    if (node) node.textContent = value;
  }

  function applyPresenterFont(doc){
    doc.documentElement.style.setProperty('--p-font-scale', String(presenterFontScale));
    setText(doc, 'p-font-level', Math.round(presenterFontScale * 100) + '%');
  }

  function changePresenterFont(doc, delta){
    presenterFontScale = Math.max(0.4, Math.min(1.2, Math.round((presenterFontScale + delta) * 10) / 10));
    applyPresenterFont(doc);
  }

  function fitNextPreview(frame){
    var previewDoc = frame.contentDocument;
    if (!previewDoc) return;
    var previewStage = previewDoc.getElementById('aps-stage');
    var previewViewport = previewDoc.getElementById('aps-viewport');
    if (!previewStage || !previewViewport) return;
    var viewportWidth = previewViewport.clientWidth;
    var viewportHeight = previewViewport.clientHeight;
    if (viewportWidth <= 0 || viewportHeight <= 0) return;
    var k = Math.min(viewportWidth / previewStage.offsetWidth,
      viewportHeight / previewStage.offsetHeight);
    previewStage.style.transform = 'scale(' + k + ')';
  }

  function refitNextPreview(doc){
    var frame = doc.getElementById('p-next-preview');
    if (frame && !frame.hidden) fitNextPreview(frame);
  }

  function updateNextPreview(doc, nextIndex){
    var frame = doc.getElementById('p-next-preview');
    var empty = doc.getElementById('p-next-empty');
    var source = slides[nextIndex];
    if (!frame || !empty) return;
    if (!source) {
      frame.hidden = true;
      empty.hidden = false;
      frame.removeAttribute('data-slide-index');
      return;
    }
    frame.hidden = false;
    empty.hidden = true;
    if (frame.getAttribute('data-slide-index') === String(nextIndex)) return;
    frame.setAttribute('data-slide-index', String(nextIndex));
    var clone = source.cloneNode(true);
    clone.classList.add('is-active');
    var sourceStyle = document.querySelector('head style');
    var css = sourceStyle ? sourceStyle.textContent : '';
    frame.onload = function(){
      fitNextPreview(frame);
    };
    frame.srcdoc = '<!doctype html><html><head><meta charset="utf-8"><style>' + css +
      '#aps-stage{flex:0 0 auto;box-shadow:none}</style></head><body><div id="aps-viewport">' +
      '<div id="aps-stage">' + clone.outerHTML + '</div></div></body></html>';
  }

  function updatePresenter(){
    if (!presenterOn) return;
    var cur = slideInfo(index) || { title: '', notes: '' };
    var nxt = slideInfo(index + 1);
    var notes = cur.notes || '這一頁沒有備註';
    var counter = '第 ' + (index + 1) + ' / ' + total + ' 頁';
    var nextText = nxt ? '下一頁：' + (nxt.title || '（未命名）') : '這是最後一頁';
    var time = elapsedText();

    if (presenterWin && !presenterWin.closed) {
      var doc = presenterWin.document;
      setText(doc, 'p-counter', counter);
      setText(doc, 'p-title', cur.title);
      setText(doc, 'p-notes', notes);
      setText(doc, 'p-next', nextText);
      setText(doc, 'p-timer', time);
      updateNextPreview(doc, index + 1);
      return;
    }
    if (inline && !inline.hidden) {
      setText(document, 'aps-p-counter', counter);
      setText(document, 'aps-p-next', nextText);
      setText(document, 'aps-p-notes', notes);
      setText(document, 'aps-p-timer', time);
    }
  }

  function openPresenter(){
    presenterOn = true;
    startedAt = Date.now();
    try { presenterWin = window.open('', 'aps-presenter', 'width=480,height=520'); } catch (err) { presenterWin = null; }
    if (presenterWin && presenterWin.document) {
      try { presenterWin.resizeTo(480, 520); } catch (err) {}
      writeShell(presenterWin.document);
      // 講者視窗被點到時焦點會跑過去，方向鍵要能繼續換頁。
      try { presenterWin.document.addEventListener('keydown', handleKey); } catch (err) {}
      if (inline) inline.hidden = true;
    } else {
      // 被瀏覽器擋掉時，退回顯示在同一個畫面上的面板
      presenterWin = null;
      if (inline) {
        inline.hidden = false;
        setText(document, 'aps-p-foot',
          '瀏覽器擋掉了獨立視窗，所以改顯示在這裡。若投影是「複製螢幕」，觀眾也會看到。' +
          '在網址列右側允許彈出式視窗後，再按一次 N 就會開成獨立視窗。');
      }
    }
    if (!timerId) timerId = setInterval(updatePresenter, 500);
    updatePresenter();
  }

  function closePresenter(){
    presenterOn = false;
    if (presenterWin && !presenterWin.closed) presenterWin.close();
    presenterWin = null;
    if (inline) inline.hidden = true;
    if (timerId) { clearInterval(timerId); timerId = null; }
  }

  function togglePresenter(){
    if (presenterOn) closePresenter(); else openPresenter();
  }

  window.addEventListener('pagehide', function(){
    if (presenterWin && !presenterWin.closed) presenterWin.close();
  });

  function fit(){
    var viewport = document.getElementById('aps-viewport');
    if (!viewport) return;
    var k = Math.min(viewport.clientWidth / stage.offsetWidth, viewport.clientHeight / stage.offsetHeight);
    stage.style.transform = 'scale(' + k + ')';
  }

  function toggleFullscreen(){
    if (document.fullscreenElement) { document.exitFullscreen(); }
    else if (document.documentElement.requestFullscreen) { document.documentElement.requestFullscreen(); }
  }

  // 換頁按鍵對照，與編輯器的 previewStepFromKey 保持一致
  function stepFromKey(key){
    if (key === 'ArrowRight' || key === 'ArrowDown' || key === 'PageDown' ||
        key === ' ' || key === 'Spacebar' || key === 'Enter') return 1;
    if (key === 'ArrowLeft' || key === 'ArrowUp' || key === 'PageUp' ||
        key === 'Backspace') return -1;
    return 0;
  }

  function handleKey(e){
    var step = stepFromKey(e.key);
    if (step !== 0) { go(index + step); e.preventDefault(); return; }
    switch (e.key) {
      case 'Home': go(0); e.preventDefault(); break;
      case 'End': go(total - 1); e.preventDefault(); break;
      case 'f': case 'F': toggleFullscreen(); e.preventDefault(); break;
      case 'n': case 'N': togglePresenter(); e.preventDefault(); break;
      case 'Escape':
        if (document.fullscreenElement) { document.exitFullscreen(); }
        else if (presenterOn) { closePresenter(); }
        break;
      default: break;
    }
  }

  document.addEventListener('keydown', handleKey);

  var prev = document.getElementById('aps-prev');
  var next = document.getElementById('aps-next');
  var full = document.getElementById('aps-full');
  if (prev) prev.addEventListener('click', function(){ go(index - 1); });
  if (next) next.addEventListener('click', function(){ go(index + 1); });
  if (full) full.addEventListener('click', toggleFullscreen);
  var presenterBtn = document.getElementById('aps-presenter');
  if (presenterBtn) presenterBtn.addEventListener('click', togglePresenter);

  // 點畫面往下一頁，右鍵往上一頁；點控制列或講者面板不算。
  var viewport = document.getElementById('aps-viewport');
  if (viewport) {
    viewport.addEventListener('click', function(){ go(index + 1); });
    viewport.addEventListener('contextmenu', function(e){ e.preventDefault(); go(index - 1); });
    viewport.style.cursor = 'pointer';
  }

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
  // 被隱藏的投影片完全不進匯出檔，頁碼與總頁數也都只算沒隱藏的。
  const shown = presentation.slides
    .map((slide, index) => ({ slide, index }))
    .filter((entry) => !isSlideHidden(entry.slide));
  const slidesHtml = shown
    .map(({ slide, index: i }, position) => {
      const master = masterForSlide(presentation, slide, i);
      const masterBody = sortedElements(
        elementsForPresenting(
          master?.elements ?? [],
          presentation.settings.hideIncompleteAi === true,
        ),
      )
        .map(renderElementToHtml)
        .join('\n      ');
      const slideBody = sortedElements(
        elementsForPresenting(slide.elements, presentation.settings.hideIncompleteAi === true),
      )
        .map(renderElementToHtml)
        .join('\n      ');
      const numberBox = slideNumberFor(presentation, i);
      const pageNumber = numberBox
        ? `<div class="aps-page-number" style="position:absolute;right:${numberBox.right}px;bottom:${numberBox.bottom}px;font-size:${numberBox.fontSize}px;color:${escapeHtml(
            numberBox.color,
          )};font-family:${escapeHtml(numberBox.fontFamily)}">${escapeHtml(numberBox.text)}</div>`
        : '';
      const body = [masterBody, slideBody, pageNumber].filter(Boolean).join('\n      ');
      return `    <section class="aps-slide${position === 0 ? ' is-active' : ''}" id="aps-slide-${escapeHtml(
        slide.id,
      )}" data-index="${position + 1}" aria-label="${escapeHtml(slide.title)}" data-title="${escapeHtml(
        slide.title,
      )}" data-notes="${escapeHtml(slide.notes)}" style="background:${escapeHtml(
        effectiveSlideBackground(presentation, slide, i),
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
      <button id="aps-presenter" type="button">N 講者檢視</button>
    </div>
    <div id="aps-counter">第 1 / ${shown.length} 頁</div>
  </div>
  <div id="aps-progress"></div>
  <div id="aps-hint">點畫面下一頁　← → ↑ ↓ 換頁　F 全螢幕　N 講者檢視　Esc 離開全螢幕</div>
  <aside id="aps-presenter-inline" hidden>
    <div class="aps-p-head">
      <strong>講者檢視</strong>
      <span id="aps-p-timer">00:00</span>
    </div>
    <div class="aps-p-meta"><span id="aps-p-counter"></span>　<span id="aps-p-next"></span></div>
    <div class="aps-p-notes" id="aps-p-notes"></div>
    <div class="aps-p-foot" id="aps-p-foot"></div>
  </aside>`
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
${navigationScript(shown.length, presentation.settings.width, presentation.settings.height)}
</${''}script>
</body>
</html>
`;
}
