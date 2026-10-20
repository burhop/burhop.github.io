import { PHYSICS, clamp, smoothstep, createFlight, stepFlight, approachProgress } from './physics.mjs';
import { VehicleRenderer } from './vehicle.mjs';
import { ArcadeAudio } from './audio.mjs';

const $ = id => document.getElementById(id);
const canvas = $('terrain');
const ctx = canvas.getContext('2d');
const audio = new ArcadeAudio();
const keys = new Set();
const emptyThrust = { lift: 0, side: 0 };
let renderer, width = 0, height = 0, accumulator = 0, lastTime = 0, hudTime = 0;
let zoom = 1, visualTurn = 0, visualBank = 0, reportAt = 0, flightMessage = '';
let best = 0;
try { best = Number(localStorage.getItem('roadster-lander-best')) || 0; } catch { /* Private browsing may disable storage. */ }

// Exported controller also lets the browser checks exercise real collision and UI paths.
export const game = { state: createFlight(), mode: 'title', ready: false, portrait: false, start, pause, resume };

function resetVisuals() {
  keys.clear();
  accumulator = 0;
  visualTurn = 0;
  visualBank = 0;
  zoom = 1;
  reportAt = 0;
  $('result').hidden = true;
  $('pause-screen').hidden = true;
  audio.thrust(0);
}

function start(mission = 1, score = 0) {
  if (!game.ready || game.portrait || $('credits').open) return;
  resetVisuals();
  game.state = createFlight(mission, score);
  game.state.status = 'flying';
  game.mode = 'flight';
  $('intro').hidden = true;
  $('title-photo').hidden = true;
  $('pause').disabled = false;
  $('pause').textContent = 'PAUSE';
  $('start').blur();
  updateHUD();
}

function retry() { start(game.state.level.mission, game.state.score - (game.state.touchdown?.bonus || 0)); }

function title() {
  resetVisuals();
  game.mode = 'title';
  game.state = createFlight();
  $('intro').hidden = false;
  $('title-photo').hidden = false;
  $('pause').disabled = true;
  updateHUD();
  $('start').focus({ preventScroll: true });
}

function pause() {
  if (game.mode !== 'flight' || game.state.status !== 'flying') return;
  game.mode = 'paused';
  keys.clear();
  accumulator = 0;
  audio.thrust(0);
  $('pause-screen').hidden = false;
  $('pause').textContent = 'RESUME';
  $('resume').focus({ preventScroll: true });
  updateHUD();
}

function resume() {
  if (game.mode !== 'paused' || game.portrait || $('credits').open) return;
  keys.clear();
  accumulator = 0;
  game.mode = 'flight';
  $('pause-screen').hidden = true;
  $('pause').textContent = 'PAUSE';
  $('resume').blur();
  updateHUD();
}

function resize() {
  width = window.innerWidth;
  height = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  renderer?.resize(width, height);
  game.portrait = height > width;
  $('orientation').hidden = !game.portrait;
  if (game.portrait) pause();
}

function input() {
  return { up: keys.has('ArrowUp') || keys.has('Space') || keys.has('KeyW'),
    left: keys.has('ArrowLeft') || keys.has('KeyA'), right: keys.has('ArrowRight') || keys.has('KeyD') };
}

function updateHUD() {
  const s = game.state, isTitle = game.mode === 'title';
  $('score').textContent = String(s.score).padStart(6, '0');
  $('best').textContent = String(best).padStart(6, '0');
  $('fuel').textContent = String(Math.ceil(s.fuel)).padStart(3, '0');
  $('fuel-bar').style.width = `${s.fuel}%`;
  $('fuel').classList.toggle('warning', s.fuel < 20 && s.status === 'flying');
  $('altitude').textContent = isTitle ? '—' : Math.max(0, s.z - s.level.pad.z).toFixed(0).padStart(3, '0');
  const vz = s.touchdown?.vz ?? s.vz, vx = s.touchdown?.vx ?? s.vx;
  $('vertical').textContent = isTitle ? '—' : `${vz > 0 ? '↑' : '↓'}${Math.abs(vz).toFixed(1)}`;
  $('horizontal').textContent = isTitle ? '—' : `${vx < 0 ? '←' : '→'}${Math.abs(vx).toFixed(1)}`;
  $('mission').textContent = String(s.level.mission).padStart(2, '0');
  $('mission-name').textContent = s.level.name;
  $('vertical-limit').textContent = PHYSICS.safeVertical.toFixed(1);
  $('horizontal-limit').textContent = PHYSICS.safeHorizontal.toFixed(1);
  let message = '';
  let status = 'AWAITING PILOT';
  if (!isTitle) {
    status = game.mode === 'paused' ? 'FLIGHT PAUSED' : s.status === 'flying' ? 'MANUAL FLIGHT' : s.status === 'landed' ? 'PARKED ON THE MOON' : 'SIGNAL LOST';
    if (s.status === 'flying' && game.mode !== 'paused') {
      if (s.fuel <= 0) message = 'FUEL DEPLETED · COASTING';
      else if (s.fuel < 20) message = 'LOW FUEL · MAKE EVERY BURN COUNT';
      else if (approachProgress(s) > .1) {
        const aligned = s.x - PHYSICS.halfWidth >= s.level.pad.left && s.x + PHYSICS.halfWidth <= s.level.pad.right;
        const safe = Math.abs(s.vx) <= PHYSICS.safeHorizontal && Math.abs(s.vz) <= PHYSICS.safeVertical;
        message = aligned && safe ? 'LOOKING GOOD · BRING IT HOME' : 'FINAL APPROACH · EASY ON THE THRUST';
      }
      if (s.elapsed < 5) message = 'ARROW KEYS TO THRUST · COUNTER YOUR MOMENTUM';
    }
  }
  $('flight-status').textContent = status;
  if (message !== flightMessage) { $('flight-message').textContent = message; flightMessage = message; }
}

function finish(time) {
  if (reportAt) return;
  reportAt = time + (game.state.status === 'landed' ? .9 : 1.2);
  keys.clear();
  $('pause').disabled = true;
  audio.thrust(0);
  const landed = game.state.status === 'landed';
  audio.finish(landed);
  if (game.state.score > best) {
    best = game.state.score;
    try { localStorage.setItem('roadster-lander-best', String(best)); } catch { /* Keep the session score. */ }
  }
  updateHUD();
}

function showReport() {
  const s = game.state, landed = s.status === 'landed';
  game.mode = 'report';
  $('result-label').textContent = landed ? `MISSION ${String(s.level.mission).padStart(2, '0')} / COMPLETE` : 'FLIGHT REPORT / TOUCHDOWN FAILED';
  $('result-title').textContent = landed ? 'WELCOME HOME.' : 'HARD LANDING.';
  $('result-copy').textContent = s.reason;
  $('result-stats').replaceChildren();
  for (const [label, value] of [['VERTICAL', `${Math.abs(s.touchdown.vz).toFixed(1)} M/S`], ['HORIZONTAL', `${Math.abs(s.touchdown.vx).toFixed(1)} M/S`], [landed ? 'POINTS' : 'FUEL LEFT', landed ? `+${s.touchdown.bonus}` : `${Math.ceil(s.fuel)}%`]]) {
    const item = document.createElement('div'), caption = document.createElement('span');
    caption.textContent = label;
    item.append(caption, document.createTextNode(value));
    $('result-stats').append(item);
  }
  $('continue').textContent = landed ? 'NEXT DRIVEWAY ↗' : 'TRY AGAIN ↗';
  $('result').hidden = false;
  $('continue').focus({ preventScroll: true });
}

function view() {
  const baseScale = Math.min(width / 1040, (height - (height < 650 ? 155 : 205)) / 445);
  const scale = Math.max(.3, baseScale) * zoom;
  const pad = game.state.level.pad;
  const focus = clamp(pad.center * .7 + game.state.x * .3, 180, 820);
  const center = 500 + (focus - 500) * (zoom - 1) / 1.6;
  const originX = width / 2 - center * scale;
  const originY = height - (height < 650 ? 65 : 90) + pad.z * (scale - baseScale);
  return { scale, x: x => originX + x * scale, y: z => originY - z * scale };
}

function stroke(points, color = '#cfd4ce', lineWidth = 1) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.stroke();
}

// Sparse fixed stars, original terrain and line art; all scenery stays monochrome.
const stars = Array.from({ length: 58 }, (_, i) => ({ x: ((i * 7919 + 47) % 997) / 997, y: ((i * 3571 + 97) % 991) / 991, a: .2 + (i % 4) * .12 }));
function drawTerrain(time, v) {
  ctx.clearRect(0, 0, width, height);
  for (const star of stars) {
    ctx.fillStyle = `rgba(220,228,219,${star.a})`;
    ctx.fillRect(star.x * width, 170 + star.y * (height - 260), 1, 1);
  }
  const s = game.state, pad = s.level.pad;
  const terrain = s.level.terrain.map(([x, z]) => [v.x(x), v.y(z)]);
  terrain.unshift([-20, terrain[0][1] + 20]);
  terrain.push([width + 20, terrain.at(-1)[1] + 20]);
  ctx.fillStyle = '#050607';
  ctx.beginPath();
  terrain.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.lineTo(width + 20, height); ctx.lineTo(-20, height); ctx.closePath(); ctx.fill();
  ctx.shadowColor = '#efffeb55'; ctx.shadowBlur = 4;
  stroke(terrain, '#d5dcd2', 1.1);
  ctx.shadowBlur = 0;
  const left = v.x(pad.left), right = v.x(pad.right), y = v.y(pad.z), depth = 22 * v.scale;
  // A concrete driveway in perspective. Its top edge is the physical contact surface.
  stroke([[left, y], [left - depth * .36, y + depth], [right + depth * .36, y + depth], [right, y]], '#aeb8aa');
  stroke([[left, y], [right, y]], '#ffffff', 2.5);
  stroke([[left - depth * .18, y + depth / 2], [right + depth * .18, y + depth / 2]], '#4a5047');
  stroke([[left, y - 7], [left, y + 5]], '#ffffff');
  stroke([[right, y - 7], [right, y + 5]], '#ffffff');
  // An outline garage gives the landing area a recognisable lunar address.
  const gx = right + 12 * v.scale, gy = y - 1, gw = 39 * v.scale, gh = 28 * v.scale;
  stroke([[gx,gy],[gx,gy-gh],[gx+gw/2,gy-gh-13*v.scale],[gx+gw,gy-gh],[gx+gw,gy],[gx,gy]], '#899382');
  stroke([[gx+7*v.scale,gy],[gx+7*v.scale,gy-gh+5*v.scale],[gx+gw-7*v.scale,gy-gh+5*v.scale],[gx+gw-7*v.scale,gy]], '#899382');
  for (let i = 1; i < 4; i++) stroke([[gx+7*v.scale,gy-i*5*v.scale],[gx+gw-7*v.scale,gy-i*5*v.scale]], '#50594d');
  ctx.font = '9px "Courier New", monospace';
  ctx.textAlign = 'center'; ctx.fillStyle = '#b5bdb0';
  ctx.fillText(`DRIVEWAY ${String(s.level.mission).padStart(2, '0')}`, (left + right) / 2, y + depth + 18);
  if (game.mode === 'title' && height > 520) {
    ctx.font = '9px "Courier New", monospace'; ctx.fillStyle = '#9ca597';
    ctx.fillText('TESLA ROADSTER / LUNAR EDITION', width * .72, height * .54 + Math.min(width * .075, 110));
    ctx.fillStyle = '#626b60'; ctx.font = '8px "Courier New", monospace';
    ctx.fillText('YOUR DAILY COMMUTE, RECONSIDERED.', width * .72, height * .54 + Math.min(width * .075, 110) + 19);
  } else if (s.status === 'flying') {
    const x = v.x(s.x), py = v.y(s.z);
    // Contact-width ticks stay constant as the presentation model turns.
    if (approachProgress(s) > .2) {
      const half = PHYSICS.halfWidth * v.scale;
      ctx.setLineDash([2, 5]);
      stroke([[x - half, py + 3], [x - half, y - 9]], '#656f60');
      stroke([[x + half, py + 3], [x + half, y - 9]], '#656f60');
      ctx.setLineDash([]);
    }
    if (x < 20 || x > width - 20 || py < 180) {
      ctx.fillStyle = '#ffffff';
      ctx.fillText('▼ ROADSTER', clamp(x, 65, width - 65), clamp(py - 24, 185, height - 100));
    }
  }
  if (s.status === 'crashed' && reportAt) {
    const age = Math.max(0, time - (reportAt - 1.2));
    ctx.globalAlpha = Math.max(0, 1 - age / 1.3);
    for (let i = 0; i < 26; i++) {
      const angle = i * 2.39996, speed = 24 + (i % 5) * 14;
      const dx = Math.cos(angle) * age * speed, dy = Math.sin(angle) * age * speed + age * age * 30;
      stroke([[v.x(s.x) + dx, v.y(s.z + 5) + dy], [v.x(s.x) + dx + Math.cos(angle) * 8, v.y(s.z + 5) + dy + Math.sin(angle) * 8]], '#ffffff');
    }
    ctx.globalAlpha = 1;
  }
}

function frame(milliseconds) {
  const time = milliseconds / 1000;
  const dt = Math.min(.05, lastTime ? time - lastTime : 0);
  lastTime = time;
  const s = game.state;
  if (game.mode === 'flight' && !game.portrait && s.status === 'flying') {
    accumulator += dt;
    while (accumulator >= PHYSICS.step) {
      stepFlight(s, input());
      accumulator -= PHYSICS.step;
    }
    if (s.status !== 'flying') finish(time);
  }
  if (reportAt && time >= reportAt && game.mode === 'flight') showReport();
  const approach = game.mode === 'title' ? 0 : approachProgress(s);
  const smooth = 1 - Math.exp(-dt * 4);
  if (game.mode !== 'paused') {
    zoom += (1 + approach * 1.6 - zoom) * smooth;
    visualTurn += (approach - visualTurn) * smooth;
    const bankTarget = game.mode === 'flight' && s.status === 'flying' ? -s.thrust.side * .075 - clamp(s.vx * .0018, -.045, .045) : 0;
    visualBank += (bankTarget - visualBank) * smooth;
  }
  const v = view();
  drawTerrain(time, v);
  const activeThrust = game.mode === 'flight' && s.status === 'flying' ? s.thrust : emptyThrust;
  if (renderer) {
    const hero = game.mode === 'title';
    renderer.draw({ x: hero ? width * .72 : v.x(s.x), y: hero ? height * .54 : v.y(s.z),
      scale: hero ? Math.min(width * .285, 400) / 44 : v.scale,
      turn: hero ? .42 : visualTurn, bank: hero ? .015 : visualBank,
      thrust: activeThrust, time, visible: !hero && s.status !== 'crashed', showJets: !hero });
  }
  audio.thrust(activeThrust.lift + Math.abs(activeThrust.side) * .45);
  if (time - hudTime > .1) { updateHUD(); hudTime = time; }
  requestAnimationFrame(frame);
}

async function fullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else {
      await $('arcade').requestFullscreen();
      // Browsers that allow a landscape lock can enforce it; all others get the overlay.
      try { await screen.orientation?.lock?.('landscape'); } catch { /* Landscape overlay remains active. */ }
    }
  } catch { $('load-status').textContent = 'Fullscreen is unavailable. Widen this window to play.'; }
}

async function toggleSound() {
  try {
    const enabled = await audio.toggle();
    $('sound').textContent = enabled ? 'SOUND ON' : 'SOUND OFF';
    $('sound').setAttribute('aria-pressed', String(enabled));
  } catch { $('sound').textContent = 'SOUND UNAVAILABLE'; }
}

window.addEventListener('keydown', event => {
  if ($('credits').open || event.ctrlKey || event.metaKey || event.altKey) return;
  const isButton = event.target instanceof HTMLElement && /^(BUTTON|A)$/.test(event.target.tagName);
  if (['ArrowUp','ArrowLeft','ArrowRight','Space','KeyW','KeyA','KeyD'].includes(event.code)) {
    if (game.mode === 'flight') { event.preventDefault(); keys.add(event.code); }
    else if (event.code === 'Space' && !isButton && !event.repeat) {
      event.preventDefault();
      if (game.mode === 'title') start();
      else if (game.mode === 'paused') resume();
    }
  }
  if (event.repeat) return;
  if (event.code === 'Enter' && !isButton && game.mode === 'title') start();
  if (event.code === 'KeyP' || event.code === 'Escape') game.mode === 'paused' ? resume() : pause();
  if (event.code === 'KeyR' && game.mode !== 'title') retry();
  if (event.code === 'KeyM') toggleSound();
  if (event.code === 'KeyF') fullscreen();
});
window.addEventListener('keyup', event => keys.delete(event.code));
window.addEventListener('blur', () => { keys.clear(); pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { keys.clear(); pause(); } });
window.addEventListener('resize', resize);
$('start').addEventListener('click', () => start());
$('pause').addEventListener('click', () => game.mode === 'paused' ? resume() : pause());
$('resume').addEventListener('click', resume);
$('restart').addEventListener('click', retry);
$('menu').addEventListener('click', title);
$('continue').addEventListener('click', () => game.state.status === 'landed' ? start(game.state.level.mission + 1, game.state.score) : retry());
$('sound').addEventListener('click', toggleSound);
$('fullscreen').addEventListener('click', fullscreen);
$('credits-open').addEventListener('click', () => { pause(); $('credits').showModal(); });

resize();
updateHUD();
requestAnimationFrame(frame);
try {
  renderer = new VehicleRenderer($('vehicle'));
  renderer.resize(width, height);
  $('vehicle').addEventListener('webglcontextlost', event => {
    event.preventDefault(); pause(); game.ready = false;
    $('load-status').textContent = 'Graphics connection lost. Reload this page to restore the Roadster.';
    $('pause-title').textContent = 'GRAPHICS INTERRUPTED.';
    $('resume').disabled = true;
    $('restart').disabled = true;
    $('start').disabled = true;
  });
  await renderer.load(event => {
    if (event.total) $('load-status').textContent = `Loading Roadster · ${Math.round(event.loaded / event.total * 100)}%`;
  });
  game.ready = true;
  $('start').disabled = false;
  $('start').innerHTML = 'START DESCENT <span>↗</span>';
  $('load-status').textContent = 'PRESS ENTER TO BEGIN · KEYBOARD REQUIRED';
} catch (error) {
  console.error('Roadster initialization failed:', error);
  $('start').textContent = 'RELOAD GAME ↻';
  $('start').disabled = false;
  $('start').addEventListener('click', () => location.reload());
  $('load-status').textContent = 'The 3D car could not load. Check your connection and enable WebGL, then reload.';
}
