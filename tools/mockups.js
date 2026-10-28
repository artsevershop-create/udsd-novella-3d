// Renders phone screenshots of the demo's main functions for the proposal page (img/mock-*.webp).
// The demo must be served over http (fetch of data/apartments.json): e.g. a static server on :8091.
// Usage: node tools/mockups.js [base-url]
//   PW=<path to playwright or playwright-core>  CHROME=<chromium executable>  — optional, for a Playwright installed elsewhere
const path = require('path');
const fs = require('fs');
const { chromium } = require(process.env.PW || 'playwright');

const BASE = (process.argv[2] || 'http://localhost:8091').replace(/\/$/, '');
const OUT = path.resolve(__dirname, '..', 'img');
fs.mkdirSync(OUT, { recursive: true });

const chip = ([sel, text]) => [...document.querySelectorAll(sel + ' .chip')].find((c) => c.textContent.includes(text)).click();
const SHOTS = [
  // in the order of the demo's tabs: Снаружи, 3D-интерьер, Вид из окна (the demo opens on our apartment in 3D)
  ['mock-free', async (p) => { await p.click('#tExt'); await p.waitForTimeout(1200); await p.evaluate(chip, ['#rExtView', 'Все корпуса']); }],
  ['mock-facade', async (p) => { await p.click('#tExt'); await p.waitForTimeout(1500); await p.evaluate(() => [...document.querySelectorAll('#stack button')].find((b) => b.textContent.trim().startsWith('8')).click()); }],
  ['mock-city', async (p) => { await p.click('#tExt'); await p.waitForTimeout(1200); await p.evaluate(chip, ['#rExtView', 'Весь город']); }],
  ['mock-design', async (p) => { await p.click('#tInt'); }],
  ['mock-bare', async (p) => { await p.click('#tInt'); await p.waitForTimeout(800); await p.evaluate(chip, ['#rFinish', 'Как продаем']); await p.evaluate(chip, ['#rView', 'Гостиная']); await p.evaluate(chip, ['#rCam', 'Хожу']); }],
  ['mock-plan', async (p) => { await p.click('#tInt'); await p.waitForTimeout(800); await p.evaluate(chip, ['#rView', 'План сверху']); }],
  ['mock-window', async (p) => { await p.click('#tWin'); }]
];

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errors = [];
  for (const [name, act] of SHOTS) {
    const page = await browser.newPage({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 });
    page.on('pageerror', (e) => errors.push(name + ': ' + e.message));
    await page.goto(BASE + '/demo/index.html');
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* ignore */ } });
    await page.waitForFunction(() => !document.getElementById('loader'), null, { timeout: 30000 });
    await page.waitForTimeout(600);
    await act(page);
    await page.waitForTimeout(2600);   // camera flights take ~0.9 s, labels settle after that
    // start the shot at the mode tabs: the phone screen shows the tabs, the 3D stage with its buttons
    const top = await page.evaluate(() => document.querySelector('.tabs').getBoundingClientRect().top + scrollY - 10);
    await page.evaluate((y) => scrollTo(0, y), top); await page.waitForTimeout(300);
    const png = await page.screenshot({ type: 'png' });
    // encode as WebP in the page itself (Playwright writes only PNG/JPEG)
    const webp = await page.evaluate(async (b64) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0);
      return c.toDataURL('image/webp', 0.82).split(',')[1];
    }, png.toString('base64'));
    fs.writeFileSync(path.join(OUT, name + '.webp'), Buffer.from(webp, 'base64'));
    console.log(name, Math.round(Buffer.from(webp, 'base64').length / 1024) + ' KB');
    await page.close();
  }
  console.log(errors.length ? errors.join('\n') : 'no page errors');
  await browser.close();
})();
