// Renders public/icons/icon.svg to the PNG sizes the web manifest needs, using the
// pre-installed Playwright Chromium. Run: npm run icons
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const svg = readFileSync(new URL('../public/icons/icon.svg', import.meta.url), 'utf8');
const out = (name) => new URL(`../public/icons/${name}`, import.meta.url).pathname;

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
async function render(size, file, { maskable = false } = {}) {
  await page.setViewportSize({ width: size, height: size });
  // Maskable icons: full-bleed background, artwork inside the 80% safe zone.
  const inner = maskable ? Math.round(size * 0.78) : size;
  const art = maskable ? svg.replace('rx="112"', 'rx="0"') : svg;
  await page.setContent(
    `<html><body style="margin:0;background:${maskable ? '#0e0f11' : 'transparent'};display:grid;place-items:center;width:${size}px;height:${size}px">
      <div style="width:${inner}px;height:${inner}px">${art.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body></html>`,
  );
  await page.screenshot({ path: out(file), omitBackground: !maskable });
}
await render(192, 'icon-192.png');
await render(512, 'icon-512.png');
await render(512, 'icon-maskable-512.png', { maskable: true });
await browser.close();
console.log('icons written');
