// World coordinates: x runs right, z is height above the lunar datum, in metres.
// Vehicle attitude is deliberately absent: all rotations are presentation only.
export const PHYSICS = Object.freeze({
  gravity: 1.62, lift: 7.2, lateral: 3.6,
  liftFuel: 2.1, lateralFuel: 1.1,
  halfWidth: 22, bodyHeight: 13.4,
  safeVertical: 4.5, safeHorizontal: 3,
  step: 1 / 120, worldWidth: 1000, ceiling: 620,
});

export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export const smoothstep = (min, max, v) => {
  const t = clamp((v - min) / (max - min), 0, 1);
  return t * t * (3 - 2 * t);
};

const layouts = [
  { name: 'TRANQUILITY DRIVE', pad: [680, 816, 68], spawn: [230, 390, 16], terrain: [[0,108],[50,123],[95,75],[145,100],[195,49],[255,68],[310,35],[365,98],[425,69],[475,130],[525,93],[575,104],[625,53],[655,68],[850,68],[900,121],[945,95],[1000,140]] },
  { name: 'CRATER CRESCENT', pad: [275, 385, 48], spawn: [765, 410, -17], terrain: [[0,125],[55,140],[110,71],[155,98],[210,51],[245,48],[420,48],[455,85],[510,110],[555,69],[605,129],[655,90],[710,148],[760,102],[820,120],[875,65],[925,107],[1000,85]] },
  { name: 'APENNINE AVENUE', pad: [615, 705, 112], spawn: [200, 420, 19], terrain: [[0,65],[60,90],[110,48],[175,82],[230,55],[290,115],[335,74],[395,130],[440,88],[495,151],[545,97],[585,112],[740,112],[780,170],[825,125],[870,152],[920,95],[1000,140]] },
];

export function makeLevel(mission = 1) {
  const index = Math.max(1, Math.floor(mission));
  const layout = layouts[(index - 1) % layouts.length];
  const [left, right, height] = layout.pad;
  const shrink = Math.min(14, Math.floor((index - 1) / 3) * 3);
  const pad = { left: left + shrink, right: right - shrink, z: height };
  pad.center = (pad.left + pad.right) / 2;
  const terrain = [...layout.terrain.map(p => [...p]), [pad.left, height], [pad.right, height]].sort((a, b) => a[0] - b[0]);
  return { mission: index, name: layout.name, pad, terrain, spawn: [...layout.spawn] };
}

export function groundHeight(level, x) {
  const p = level.terrain;
  if (x <= p[0][0]) return p[0][1];
  for (let i = 1; i < p.length; i++) {
    if (x <= p[i][0]) {
      const t = (x - p[i - 1][0]) / (p[i][0] - p[i - 1][0]);
      return p[i - 1][1] + t * (p[i][1] - p[i - 1][1]);
    }
  }
  return p.at(-1)[1];
}

// Include peaks between the wheels, not just the height under the centre.
export function groundUnderVehicle(level, x) {
  const left = x - PHYSICS.halfWidth, right = x + PHYSICS.halfWidth;
  let height = Math.max(groundHeight(level, left), groundHeight(level, right));
  for (const [tx, tz] of level.terrain) if (tx > left && tx < right) height = Math.max(height, tz);
  return height;
}

export function createFlight(mission = 1, score = 0) {
  const level = makeLevel(mission);
  return { level, x: level.spawn[0], z: level.spawn[1], vx: level.spawn[2], vz: -7,
    fuel: 100, elapsed: 0, score, status: 'ready', reason: '', thrust: { lift: 0, side: 0 }, touchdown: null };
}

export function approachProgress(state) {
  const height = state.z - state.level.pad.z;
  const proximity = 1 - smoothstep(90, 210, Math.abs(state.x - state.level.pad.center));
  return (1 - smoothstep(10, 145, height)) * proximity;
}

export function stepFlight(state, input, dt = PHYSICS.step) {
  if (state.status !== 'flying') return;
  if (!Number.isFinite(dt) || dt <= 0 || dt > 0.1) throw new RangeError('Use simulation steps of 0 < dt <= 0.1 seconds.');
  const lift = input.up ? 1 : 0;
  const side = Number(Boolean(input.right)) - Number(Boolean(input.left));
  const cost = (lift * PHYSICS.liftFuel + Math.abs(side) * PHYSICS.lateralFuel) * dt;
  const available = cost ? Math.min(1, state.fuel / cost) : 0;
  state.fuel = Math.max(0, state.fuel - cost);
  state.thrust = { lift: lift * available, side: side * available };
  const ax = side * available * PHYSICS.lateral;
  const az = lift * available * PHYSICS.lift - PHYSICS.gravity;
  state.x += state.vx * dt + ax * dt * dt / 2;
  state.z += state.vz * dt + az * dt * dt / 2;
  state.vx += ax * dt;
  state.vz += az * dt;
  state.elapsed += dt;

  if (state.x - PHYSICS.halfWidth < 0 || state.x + PHYSICS.halfWidth > PHYSICS.worldWidth || state.z > PHYSICS.ceiling) {
    finishFlight(state, false, 'You left the flight area. Use short burns to counter your drift.');
    return;
  }
  const ground = groundUnderVehicle(state.level, state.x);
  if (state.z > ground) return;
  const pad = state.level.pad;
  const onDriveway = state.x - PHYSICS.halfWidth >= pad.left && state.x + PHYSICS.halfWidth <= pad.right;
  const gentle = state.vz <= 0 && Math.abs(state.vz) <= PHYSICS.safeVertical && Math.abs(state.vx) <= PHYSICS.safeHorizontal;
  state.z = ground;
  if (!onDriveway) finishFlight(state, false, 'That was lunar rock. Bring the whole car inside the driveway markers.');
  else if (!gentle) finishFlight(state, false, Math.abs(state.vx) > PHYSICS.safeHorizontal
    ? 'Too much sideways drift. Fire the opposite thruster before touching down.'
    : 'A little too fast. Start braking earlier and feather the lift thrusters.');
  else finishFlight(state, true, 'A perfect place to park. Welcome to your lunar address.');
}

function finishFlight(state, landed, reason) {
  state.status = landed ? 'landed' : 'crashed';
  state.reason = reason;
  const bonus = landed ? Math.round(1000 + state.fuel * 10 + Math.max(0, 4.5 - Math.abs(state.vz)) * 100) : 0;
  state.touchdown = { vx: state.vx, vz: state.vz, bonus };
  state.score += bonus;
  state.thrust = { lift: 0, side: 0 };
  state.vx = state.vz = 0;
}
