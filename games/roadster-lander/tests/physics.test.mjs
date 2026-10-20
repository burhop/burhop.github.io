import test from 'node:test';
import assert from 'node:assert/strict';
import { PHYSICS, createFlight, stepFlight, approachProgress, groundUnderVehicle, makeLevel, clamp } from '../js/physics.mjs';

function flying() { const s = createFlight(); s.status = 'flying'; return s; }
function advance(s, seconds, input = {}, dt = PHYSICS.step) {
  for (let i = 0; i < Math.round(seconds / dt); i++) stepFlight(s, input, dt);
}
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

test('ballistic coast preserves horizontal momentum and follows lunar gravity', () => {
  const s = flying(), { x, z, vx, vz } = s;
  advance(s, 2);
  close(s.x, x + vx * 2); close(s.vx, vx);
  close(s.z, z + vz * 2 - PHYSICS.gravity * 2); close(s.vz, vz - PHYSICS.gravity * 2);
  assert.equal(s.fuel, 100);
});
test('left and right apply direct sideways thrust; lift opposes gravity', () => {
  const left = flying(), right = flying(), up = flying();
  advance(left, 1, { left: true }); advance(right, 1, { right: true }); advance(up, 1, { up: true });
  close(left.vx, 16 - PHYSICS.lateral); close(right.vx, 16 + PHYSICS.lateral);
  close(up.vz, -7 + PHYSICS.lift - PHYSICS.gravity);
  close(up.fuel, 100 - PHYSICS.liftFuel);
  assert.equal(left.thrust.side, -1); assert.equal(right.thrust.side, 1);
});
test('opposing sideways inputs cancel without wasting fuel', () => {
  const s = flying(); advance(s, 1, { left: true, right: true });
  close(s.vx, 16); assert.equal(s.fuel, 100); assert.equal(s.thrust.side, 0);
});
test('diagonal thrust charges both engines and fuel never goes below zero', () => {
  const s = flying(); advance(s, 1, { up: true, right: true });
  close(s.fuel, 100 - PHYSICS.liftFuel - PHYSICS.lateralFuel);
  s.fuel = .001; advance(s, 1, { up: true, right: true });
  assert.equal(s.fuel, 0); assert.deepEqual(s.thrust, { lift: 0, side: 0 });
  const vx = s.vx, vz = s.vz;
  advance(s, 1, { up: true, left: true }); close(s.vx, vx); close(s.vz, vz - PHYSICS.gravity);
});
test('integration gives the same trajectory at 60, 120 and 240 Hz', () => {
  const states = [60, 120, 240].map(hz => { const s = flying(); advance(s, 3, { up: true, right: true }, 1 / hz); return s; });
  for (const s of states.slice(1)) for (const key of ['x','z','vx','vz','fuel']) close(s[key], states[0][key]);
});
test('gentle centred landing succeeds and awards points exactly once', () => {
  const s = flying(); Object.assign(s, { x: s.level.pad.center, z: s.level.pad.z + .01, vx: .1, vz: -1 });
  advance(s, .1);
  assert.equal(s.status, 'landed'); assert.ok(s.score > 1000); assert.equal(s.z, s.level.pad.z);
  const score = s.score; advance(s, 1, { up: true }); assert.equal(s.score, score);
});
test('fast descent or sideways drift crashes even when centred', () => {
  for (const [vx, vz] of [[0,-8],[5,-1]]) {
    const s = flying(); Object.assign(s, { x: s.level.pad.center, z: s.level.pad.z + .001, vx, vz });
    advance(s, .1); assert.equal(s.status, 'crashed'); assert.equal(s.score, 0);
  }
});
test('a driveway edge under only part of the car does not count as parked', () => {
  const s = flying(); Object.assign(s, { x: s.level.pad.left + PHYSICS.halfWidth - 1, z: s.level.pad.z + .001, vx: 0, vz: -1 });
  advance(s, .1); assert.equal(s.status, 'crashed');
});
test('ground collision detects peaks between the wheels', () => {
  const level = { terrain: [[0, 0],[100, 25],[200, 0]] };
  assert.equal(groundUnderVehicle(level, 100), 25);
});
test('zero-fuel landing still works if the remaining trajectory is safe', () => {
  const s = flying(); Object.assign(s, { x: s.level.pad.center, z: s.level.pad.z + .001, vx: 0, vz: -1, fuel: 0 });
  advance(s, .1); assert.equal(s.status, 'landed');
});
test('turn depends on driveway proximity and altitude without changing physics', () => {
  const s = flying(); s.x = s.level.pad.center; s.z = s.level.pad.z + 180;
  assert.equal(approachProgress(s), 0);
  s.z = s.level.pad.z + 70; const middle = approachProgress(s); assert.ok(middle > 0 && middle < 1);
  s.z = s.level.pad.z + 5; assert.equal(approachProgress(s), 1);
  s.x = 100; assert.equal(approachProgress(s), 0);
  const before = structuredClone(s); approachProgress(s); assert.deepEqual(s, before);
});
test('ready and completed simulations cannot move; out-of-bounds flight ends', () => {
  const ready = createFlight(), before = structuredClone(ready); advance(ready, 1); assert.deepEqual(ready, before);
  const s = flying(); s.x = PHYSICS.halfWidth; s.vx = -20;
  stepFlight(s, {}); assert.equal(s.status, 'crashed'); assert.match(s.reason, /flight area/);
});
test('later levels remain landable and use distinct driveway locations', () => {
  assert.notEqual(makeLevel(1).pad.center, makeLevel(2).pad.center);
  for (let i = 1; i <= 50; i++) {
    const l = makeLevel(i);
    assert.ok(l.pad.right - l.pad.left > PHYSICS.halfWidth * 2);
    assert.equal(groundUnderVehicle(l, l.pad.center), l.pad.z);
  }
});

test('all three full missions are reachable using only the available thrust controls and fuel', () => {
  for (let mission = 1; mission <= 3; mission++) {
    const s = createFlight(mission); s.status = 'flying';
    // A test-only pilot brakes toward the driveway, staying high until aligned.
    for (let i = 0; i < 20000 && s.status === 'flying'; i++) {
      const dx = s.level.pad.center - s.x;
      const targetVx = clamp(dx * .16, -25, 25);
      const targetHeight = Math.abs(dx) > 70 ? s.level.pad.z + 160 : s.level.pad.z;
      const targetVz = clamp((targetHeight - s.z) * .18, -16, 10);
      stepFlight(s, { left: s.vx > targetVx + .15, right: s.vx < targetVx - .15, up: s.vz < targetVz - .1 });
    }
    assert.equal(s.status, 'landed', `Mission ${mission}: ${s.reason}`);
    assert.ok(s.fuel > 0);
  }
});
