// Renders every Mermaid block in docs/requirements/*.md with mermaid.js in Chromium and fails on any parse error.
import { chromium } from 'playwright';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dirs = ['docs/requirements', 'docs/issues'].map((d) => resolve(root, d));
const blocks = dirs.flatMap((dir) => readdirSync(dir).filter(f => f.endsWith('.md')).flatMap(f =>
  [...readFileSync(resolve(dir, f), 'utf8').matchAll(/```mermaid\r?\n([\s\S]*?)```/g)].map((m, i) => ({ id: `${f}#${i + 1}`, code: m[1] }))));
const browser = await chromium.launch(); const page = await browser.newPage();
await page.setContent('<html><body></body></html>');
await page.addScriptTag({ url: 'https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js' });
let bad = 0;
for (const b of blocks) {
  const res = await page.evaluate(async ({ id, code }) => {
    try { mermaid.initialize({ startOnLoad: false }); const { svg } = await mermaid.render('m' + Math.random().toString(36).slice(2), code); return { ok: true, size: svg.length }; }
    catch (e) { return { ok: false, err: String(e.message || e).slice(0, 200) }; }
  }, b);
  console.log(`${res.ok ? 'OK  ' : 'FAIL'} ${b.id} ${res.ok ? res.size + ' bytes of SVG' : res.err}`);
  if (!res.ok) bad++;
}
await browser.close();
if (bad) process.exit(1);
console.log(`PASS: ${blocks.length} Mermaid diagrams render`);
