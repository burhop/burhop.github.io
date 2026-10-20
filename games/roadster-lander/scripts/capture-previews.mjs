import { chromium } from 'playwright';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const url = process.env.GAME_URL || 'http://127.0.0.1:8080/games/roadster-lander/';
let executablePath = process.env.CHROME_PATH;
if (!executablePath && process.platform === 'win32') {
  const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  try { await access(chrome); executablePath = chrome; } catch { /* Use Playwright's Chromium. */ }
}
const browser = await chromium.launch({ executablePath, headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await page.waitForFunction(() => document.querySelector('#start').textContent.includes('START DESCENT'), null, { timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
  await page.locator('#title-photo').evaluate(image => image.decode());
  // Let the first WebGL frame and responsive layout finish before capturing.
  await page.waitForTimeout(700);
  for (const [name, width, height] of [['social-preview.png', 1200, 630], ['preview.png', 1280, 720]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(150);
    const path = fileURLToPath(new URL(`../assets/${name}`, import.meta.url));
    await page.screenshot({ path });
    console.log(`${width} × ${height}: ${path}`);
  }
  if (errors.length) throw new Error(errors.join('\n'));
} finally { await browser.close(); }
