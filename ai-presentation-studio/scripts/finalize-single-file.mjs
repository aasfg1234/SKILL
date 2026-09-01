import { copyFile, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const distDir = new URL('../dist/', import.meta.url);
const source = new URL('index.html', distDir);
const output = new URL('AI-Presentation-Studio.html', distDir);
const distPath = fileURLToPath(distDir);
const html = await readFile(source, 'utf8');

const externalAsset = /<(?:script|link)\b[^>]*(?:src|href)=["'](?!data:|#)[^"']+["']/i;
if (externalAsset.test(html)) {
  throw new Error('單檔檢查失敗：HTML 仍引用外部 JavaScript 或 CSS。');
}
if (!/<script\b[^>]*>[\s\S]+<\/script>/i.test(html)) {
  throw new Error('單檔檢查失敗：找不到內嵌 JavaScript。');
}
if (!/<style\b[^>]*>[\s\S]+<\/style>/i.test(html)) {
  throw new Error('單檔檢查失敗：找不到內嵌 CSS。');
}
if (/(?:@import\s+|url\(\s*["']?)(?:https?:)?\/\//i.test(html)) {
  throw new Error('單檔檢查失敗：CSS 仍引用網路資源。');
}
if (!html.includes('<div id="root"></div>')) {
  throw new Error('單檔檢查失敗：找不到應用程式入口。');
}

await copyFile(source, output);

for (const entry of await readdir(distDir, { withFileTypes: true })) {
  if (entry.name === 'AI-Presentation-Studio.html') continue;
  await rm(join(distPath, entry.name), { recursive: true, force: true });
}

const remaining = (await readdir(distDir, { withFileTypes: true })).filter(
  (entry) => entry.isFile(),
);
if (remaining.length !== 1 || remaining[0].name !== 'AI-Presentation-Studio.html') {
  throw new Error('單檔檢查失敗：dist 不是只有一個 HTML。');
}

console.log('單檔檢查通過：JavaScript、CSS 與圖示都已內嵌。');
console.log('單檔版本：dist/AI-Presentation-Studio.html');
