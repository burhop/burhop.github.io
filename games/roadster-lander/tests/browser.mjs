import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const url = process.env.GAME_URL || 'http://127.0.0.1:8080/games/roadster-lander/';
const output = fileURLToPath(new URL('../test-results/', import.meta.url));
await mkdir(output, { recursive: true });
let executablePath = process.env.CHROME_PATH;
if (!executablePath && process.platform === 'win32') {
  const path = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  try { await access(path); executablePath = path; } catch { /* Use Playwright's browser. */ }
}
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('response', res => { if (res.status() >= 400) errors.push(`${res.status()} ${res.url()}`); });
const state = () => page.evaluate(async () => {
  const { game } = await import('./js/game.mjs');
  return { ...game.state, mode: game.mode, ready: game.ready, portrait: game.portrait };
});
try {
  await page.goto(url);
  await page.waitForFunction(() => document.querySelector('#start').textContent.includes('START DESCENT'), null, { timeout: 60000 });
  await page.screenshot({ path: `${output}/title.png` });
  assert.equal((await state()).ready, true);
  await page.click('#start');
  await page.keyboard.down('ArrowRight');
  await page.waitForFunction(async () => (await import('./js/game.mjs')).game.state.vx > 16.2);
  await page.keyboard.up('ArrowRight');
  const right = await state(); assert.ok(right.vx > 16, 'right thrust accelerates right');
  await page.keyboard.down('ArrowLeft');
  await page.waitForFunction(async previous => (await import('./js/game.mjs')).game.state.vx < previous - .2, right.vx);
  await page.keyboard.up('ArrowLeft');
  assert.ok((await state()).vx < right.vx, 'left thrust brakes rightward momentum');
  await page.keyboard.down('ArrowUp');
  await page.waitForFunction(async () => (await import('./js/game.mjs')).game.state.thrust.lift > 0);
  assert.ok((await state()).thrust.lift > 0);
  await page.screenshot({ path: `${output}/flight.png` });
  await page.keyboard.up('ArrowUp');
  await page.keyboard.press('KeyP');
  const paused = await state(); assert.equal(paused.mode, 'paused');
  await page.waitForTimeout(300); assert.equal((await state()).elapsed, paused.elapsed);
  await page.click('#resume'); await page.waitForTimeout(150);
  assert.equal((await state()).thrust.lift, 0, 'no stuck key on resume');
  await page.setViewportSize({ width: 540, height: 900 });
  await page.waitForTimeout(100); assert.equal(await page.locator('#touch-controls').isVisible(), true);
  const portrait = await state(); assert.equal(portrait.mode, 'flight');
  await page.waitForTimeout(150); assert.ok((await state()).elapsed > portrait.elapsed);
  await page.screenshot({ path: `${output}/portrait.png` });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  assert.equal((await state()).mode, 'paused');
  await page.click('#restart');

  // A deterministic setup goes through the actual simulation and report handlers.
  await page.evaluate(async () => {
    const { game } = await import('./js/game.mjs');
    Object.assign(game.state, { x: game.state.level.pad.center, z: game.state.level.pad.z + .02, vx: .1, vz: -1 });
  });
  await page.waitForFunction(() => !document.querySelector('#result').hidden);
  assert.equal((await state()).status, 'landed');
  assert.match(await page.locator('#result-title').textContent(), /WELCOME HOME/);
  const score = (await state()).score; assert.ok(score > 1000);
  await page.screenshot({ path: `${output}/landed.png` });
  await page.click('#continue'); assert.equal((await state()).level.mission, 2); assert.equal((await state()).score, score);
  await page.evaluate(async () => {
    const { game } = await import('./js/game.mjs');
    Object.assign(game.state, { x: game.state.level.pad.center, z: game.state.level.pad.z + .02, vx: 0, vz: -9 });
  });
  await page.waitForFunction(() => !document.querySelector('#result').hidden);
  assert.equal((await state()).status, 'crashed');
  await page.click('#continue'); assert.equal((await state()).level.mission, 2);
  assert.equal((await state()).fuel, 100);
  await page.click('#credits-open'); assert.equal((await state()).mode, 'paused');
  assert.equal(await page.locator('#credits').isVisible(), true);
  await page.locator('#credits .primary').click(); await page.click('#resume');

  // Freeze only simulation, allowing the visual approach animation to settle.
  await page.evaluate(async () => {
    const { game } = await import('./js/game.mjs');
    Object.assign(game.state, { x: game.state.level.pad.center, z: game.state.level.pad.z + 24, vx: 0, vz: -1, thrust: { lift: 1, side: -1 } });
    game.mode = 'report';
  });
  await page.waitForTimeout(1400);
  await page.screenshot({ path: `${output}/approach.png` });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.screenshot({ path: `${output}/small-landscape.png` });
  assert.equal((await state()).portrait, false);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.reload(); await page.waitForFunction(() => document.querySelector('#start').textContent.includes('START DESCENT'));
  await page.screenshot({ path: `${output}/small-title.png` });
  const startBox = await page.locator('#start').boundingBox();
  const footerBox = await page.locator('.bottom-bar').boundingBox();
  assert.ok(startBox.y + startBox.height < footerBox.y, 'start button clears footer in small landscape');
  assert.ok(Number(await page.locator('#best').textContent()) >= score, 'best score persists');
  assert.deepEqual(errors, [], `Browser errors: ${errors.join('\n')}`);
  console.log('Browser checks passed: 3D loading, controls, pause, orientation, focus loss, landing, crash, retry, next mission, credits, responsive layout, stored score.');
  console.log(`Screenshots: ${output}`);
} catch (error) {
  console.error('State at failure:', await state().catch(() => 'unavailable'));
  console.error('Browser errors:', errors);
  await page.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  throw error;
} finally { await browser.close(); }
