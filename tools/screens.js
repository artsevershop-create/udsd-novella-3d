// Screenshot check of the demo and the proposal page on a phone-sized viewport.
// Usage: npm i playwright && npx playwright install chromium && node tools/screens.js
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'shots');
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const shot = async (name, ms = 2500) => { await page.waitForTimeout(ms); await page.screenshot({ path: path.join(out, name + '.png') }); };
  const chip = (sel, text) => page.evaluate(([s, t]) => { [...document.querySelectorAll(s + ' .chip')].find((c) => c.textContent.includes(t)).click(); }, [sel, text]);

  await page.goto('file://' + path.join(root, 'demo/index.html'));
  await shot('01-interior');
  await chip('#rView', 'План сверху'); await shot('02-plan-neighbours');
  await chip('#rFinish', 'Как продаем'); await chip('#rTime', 'Вечер'); await shot('03-bare-evening');
  await page.click('#tWin'); await shot('04-window-evening');
  await chip('#rTime', 'День'); await page.click('#tExt'); await shot('05-outside');
  await chip('#rExtView', 'Все корпуса'); await shot('06-all-buildings');
  await chip('#rExtView', 'Окрестности'); await shot('07-surroundings', 3500);

  await page.goto('file://' + path.join(root, 'index.html'));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(out, '08-proposal.png'), fullPage: true });

  console.log(errors.length ? errors.join('\n') : 'no page errors');
  await browser.close();
})();
