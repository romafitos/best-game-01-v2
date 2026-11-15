// TIDEKEEPER v2 — world: the state machine and the simulation.
// One job: own the game state (title / play / night-clear / dawn / wreck)
// and advance it one fixed step at a time. Rendering and input live
// elsewhere; this file never touches the canvas or the keyboard.

import {
  VIEW, HORIZON_Y, LAMP, HARBOUR, MAX_WRECKS, NIGHT_COUNT,
  BOAT_TYPES, NIGHTS, SCORING, ROCKS, GULL, GUST, FLARE_SECONDS, FLARE_LIT_SECONDS,
} from './config.js';
import { mulberry32, randInt, pick } from './random.js';
import { aimBeamAt, isBoatLit, steerBoat } from './beam.js';

let boatId = 0;

export function createWorld(seed) {
  const rng = mulberry32(seed);
  const world = {
    seed,
    rng,
    state: 'title', // title | play | nightclear | dawn | wreck
    time: 0,
    night: 1,
    boats: [],
    rocks: [],
    gulls: [],
    particles: [],
    docked: [], // boats moored at the pier on the dawn screen
    spawnQueue: [],
    spawnTimer: 0,
    score: 0,
    best: 0,
    wrecks: 0,
    savedTotal: 0,
    savedThisNight: 0,
    flares: NIGHTS[0].flares,
    flareTimer: 0, // rocks stay lit while > 0
    flareLitTimer: 0, // all boats lit while > 0
    beamAngle: 0.12,
    focus: false, // false = wide/near, true = narrow/far
    fog: NIGHTS[0].fog,
    rain: 0, // 0..1, visual only
    current: NIGHTS[0].current,
    gustPlan: [], // { at, dir } sorted by time
    gustWarn: null, // { dir, until } while telegraphed
    gustActive: null, // { dir, until } while pushing
    bannerTimer: 0,
    shake: 0,
    sprayTimer: 0, // ambient spray at the rock bases
    nightStats: { saved: 0, nearMiss: 0 },
    message: '',
  };
  try { world.best = Number(localStorage.getItem('tidekeeper-best') || 0) || 0; } catch (e) { /* no storage */ }
  return world;
}

// --- night setup -----------------------------------------------------------

export function startNight(world, n) {
  const cfg = NIGHTS[n - 1];
  world.night = n;
  world.boats = [];
  world.rocks = makeRocks(world.rng, ROCKS.perNight[n - 1]);
  world.gulls = makeGulls(world.rng, cfg.gulls);
  world.particles = [];
  world.docked = [];
  world.spawnQueue = makeSpawnQueue(world.rng, cfg.boats, n);
  world.spawnTimer = 0.8;
  world.flares = cfg.flares;
  world.flareTimer = 0;
  world.flareLitTimer = 0;
  world.fog = cfg.fog;
  world.rain = cfg.rain;
  world.current = cfg.current;
  world.gustPlan = makeGustPlan(world.rng, cfg.gusts);
  world.gustWarn = null;
  world.gustActive = null;
  world.savedThisNight = 0;
  world.nightStats = { saved: 0, nearMiss: 0 };
  world.state = 'play';
}

function makeRocks(rng, count) {
  const rocks = [];
  let tries = 0;
  while (rocks.length < count && tries < 400) {
    tries++;
    const r = randInt(rng, ROCKS.minR, ROCKS.maxR);
    const x = randInt(rng, 420, 1140); // clear of the spawn corridor (x < 420)
    const y = randInt(rng, HORIZON_Y + 70, 420); // the bottom 60 px stays a safe drift lane
    let ok = true;
    for (const o of rocks) {
      const dx = o.x - x, dy = o.y - y;
      if (Math.hypot(dx, dy) < o.r + r + 48) { ok = false; break; }
    }
    if (ok) rocks.push({ id: rocks.length, x, y, r, peaks: 2 + Math.floor(rng() * 2) });
  }
  return rocks;
}

function makeGulls(rng, count) {
  const gulls = [];
  for (let i = 0; i < count; i++) {
    gulls.push({
      x: randInt(rng, 200, 1200),
      y: randInt(rng, 130, 250),
      vx: (rng() < 0.5 ? -1 : 1) * GULL.speed * (0.7 + rng() * 0.6),
      phase: rng() * Math.PI * 2,
    });
  }
  return gulls;
}

function makeSpawnQueue(rng, count, night) {
  const types = ['skiff', 'skiff', 'freighter'];
  if (night >= 3) types.push('freighter', 'barge');
  if (night >= 4) types.push('barge');
  const queue = [];
  for (let i = 0; i < count; i++) queue.push(pick(rng, types));
  return queue;
}

function makeGustPlan(rng, count) {
  const plan = [];
  for (let i = 0; i < count; i++) {
    plan.push({ at: 8 + rng() * 26, dir: rng() < 0.5 ? -1 : 1 });
  }
  return plan.sort((a, b) => a.at - b.at);
}

// --- boats -----------------------------------------------------------------

export function spawnBoat(world, type) {
  const t = BOAT_TYPES[type];
  const boat = {
    id: boatId++,
    type,
    x: 250, // emerge from behind the headland, already inside beam reach
    y: randInt(world.rng, 230, 380),
    r: t.r,
    speed: t.speed,
    hits: t.hits,
    maxHits: t.hits,
    drift: t.drift,
    lit: false,
    saved: false,
    wrecked: false,
    invuln: 0,
    bob: world.rng() * Math.PI * 2,
    nearMissed: new Set(),
    smoke: 0,
  };
  world.boats.push(boat);
  return boat;
}

// --- main step -------------------------------------------------------------

export function stepWorld(world, dt, ctrl) {
  world.time += dt;
  if (world.shake > 0) world.shake = Math.max(0, world.shake - dt * 3);

  // Beam follows the pointer; F toggles focus; SPACE fires a flare.
  if (ctrl.aimX !== undefined) {
    world.beamAngle = aimBeamAt(world.beamAngle, ctrl.aimX, ctrl.aimY);
  }
  if (ctrl.focusPressed) world.focus = !world.focus;
  if (ctrl.flarePressed) fireFlare(world);

  if (world.flareTimer > 0) world.flareTimer -= dt;
  if (world.flareLitTimer > 0) world.flareLitTimer -= dt;

  if (world.state === 'nightclear') {
    world.bannerTimer -= dt;
    stepParticles(world, dt);
    if (world.bannerTimer <= 0) {
      if (world.night >= NIGHT_COUNT) { endGame(world, true); }
      else startNight(world, world.night + 1);
    }
    return;
  }
  if (world.state !== 'play') { stepParticles(world, dt); return; }

  // Gusts: telegraph, then push.
  if (world.gustPlan.length && world.time >= world.gustPlan[0].at - GUST.warnSeconds && !world.gustWarn && !world.gustActive) {
    world.gustWarn = { dir: world.gustPlan[0].dir, until: world.time + GUST.warnSeconds };
  }
  if (world.gustWarn && world.time >= world.gustWarn.until) {
    world.gustActive = { dir: world.gustWarn.dir, until: world.time + GUST.duration };
    world.gustWarn = null;
    world.gustPlan.shift();
  }
  if (world.gustActive && world.time >= world.gustActive.until) world.gustActive = null;

  // Spawning.
  if (world.spawnQueue.length) {
    world.spawnTimer -= dt;
    if (world.spawnTimer <= 0) {
      spawnBoat(world, world.spawnQueue.shift());
      world.spawnTimer = 2.4 + world.rng() * 1.2;
    }
  }

  // Ambient spray where the waves break on the rocks, so the sea is alive
  // even when no boat is near.
  world.sprayTimer -= dt;
  if (world.sprayTimer <= 0 && world.rocks.length) {
    world.sprayTimer = 0.35;
    const rock = world.rocks[Math.floor(world.rng() * world.rocks.length)];
    burst(world, rock.x + (world.rng() - 0.5) * rock.r, rock.y + rock.r * 0.4, 'spray', 2);
  }

  // Gulls drift across the sky and wrap.
  for (const g of world.gulls) {
    g.x += g.vx * dt;
    g.phase += dt * 6;
    if (g.x < -40) { g.x = VIEW.w + 30; g.y = randInt(world.rng, 130, 250); }
    if (g.x > VIEW.w + 40) { g.x = -30; g.y = randInt(world.rng, 130, 250); }
  }

  // Boats.
  for (const boat of world.boats) {
    if (boat.saved || boat.wrecked) continue;
    boat.bob += dt * 2;
    if (boat.invuln > 0) boat.invuln -= dt;
    boat.lit = world.flareLitTimer > 0 || isBoatLit(world, boat);
    steerBoat(world, boat, dt);
    if (world.gustActive) boat.y += world.gustActive.dir * GUST.push * dt;
    boat.y = Math.max(HORIZON_Y + 24, Math.min(VIEW.h - 12, boat.y));
    checkRocks(world, boat);
    if (boat.wrecked) continue;
    if (boat.x >= HARBOUR.x - 8) saveBoat(world, boat);
  }
  world.boats = world.boats.filter((b) => !b.wrecked && !b.saved);

  stepParticles(world, dt);

  // Night ends when nothing is left to resolve.
  if (!world.spawnQueue.length && world.boats.length === 0) {
    const bonus = SCORING.nightClear + world.flares * SCORING.flareLeft;
    world.score += bonus;
    world.message = `NIGHT ${world.night} CLEAR  +${bonus}`;
    world.state = 'nightclear';
    world.bannerTimer = 2.4;
  }
  if (world.wrecks >= MAX_WRECKS) endGame(world, false);
}

function checkRocks(world, boat) {
  for (const rock of world.rocks) {
    const dx = boat.x - rock.x, dy = boat.y - rock.y;
    const d = Math.hypot(dx, dy);
    if (d < rock.r + boat.r * 0.55) {
      if (boat.invuln > 0) continue;
      if (boat.hits > 1) {
        boat.hits -= 1;
        boat.invuln = 2;
        boat.x = rock.x + (dx / (d || 1)) * (rock.r + boat.r + 6);
        boat.y = rock.y + (dy / (d || 1)) * (rock.r + boat.r + 6);
        burst(world, boat.x, boat.y, 'spark', 10);
        world.shake = 0.4;
      } else {
        wreckBoat(world, boat, rock);
      }
      return;
    }
    // Near-miss: threaded a rock inside one beam-width, once per rock.
    if (!boat.nearMissed.has(rock.id) && d < rock.r + boat.r + 26) {
      boat.nearMissed.add(rock.id);
      world.score += SCORING.nearMiss;
      world.nightStats.nearMiss += 1;
      addTextParticle(world, boat.x, boat.y - 22, `+${SCORING.nearMiss} CLOSE!`);
    }
  }
}

function saveBoat(world, boat) {
  boat.saved = true;
  world.score += SCORING.saved;
  world.savedTotal += 1;
  world.savedThisNight += 1;
  world.nightStats.saved += 1;
  addTextParticle(world, HARBOUR.x - 60, boat.y - 20, `+${SCORING.saved} HOME`);
  burst(world, HARBOUR.x - 20, boat.y, 'spray', 8);
}

function wreckBoat(world, boat, rock) {
  boat.wrecked = true;
  world.wrecks += 1;
  burst(world, boat.x, boat.y, 'wreck', 22);
  world.shake = 1;
  addTextParticle(world, boat.x, boat.y - 26, 'WRECKED');
}

function fireFlare(world) {
  if (world.flares <= 0 || world.state !== 'play') return;
  world.flares -= 1;
  world.flareTimer = FLARE_SECONDS;
  world.flareLitTimer = FLARE_LIT_SECONDS;
  for (const g of world.gulls) g.vx = -g.vx; // flare scares the gulls off
  burst(world, LAMP.x, LAMP.y, 'flare', 14);
}

function endGame(world, won) {
  world.state = won ? 'dawn' : 'wreck';
  if (won) {
    // Moor the saved boats in the water ALONGSIDE the pier (x ~1150, not
    // on top of the dark planks where their hulls would vanish) so the
    // win screen SHOWS the win: up to six boats, lanterns still burning.
    const types = ['skiff', 'freighter', 'barge', 'skiff', 'freighter', 'skiff'];
    const n = Math.min(6, world.savedTotal);
    world.docked = [];
    for (let i = 0; i < n; i++) {
      const type = types[i % types.length];
      world.docked.push({ type, x: 1150, y: 312 + i * 23, r: BOAT_TYPES[type].r * 0.95 });
    }
  }
  if (world.score > world.best) {
    world.best = world.score;
    try { localStorage.setItem('tidekeeper-best', String(world.best)); } catch (e) { /* no storage */ }
  }
}

// --- particles -------------------------------------------------------------

export function burst(world, x, y, kind, n) {
  for (let i = 0; i < n; i++) {
    const a = world.rng() * Math.PI * 2;
    const sp = 30 + world.rng() * 90;
    world.particles.push({
      kind, x, y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 20,
      life: 0.5 + world.rng() * 0.7, maxLife: 1.2,
    });
  }
  if (world.particles.length > 220) world.particles.splice(0, world.particles.length - 220);
}

export function addTextParticle(world, x, y, text) {
  world.particles.push({ kind: 'text', x, y, vx: 0, vy: -26, life: 1.1, maxLife: 1.1, text });
}

function stepParticles(world, dt) {
  for (const p of world.particles) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.kind === 'spray' || p.kind === 'wreck') p.vy += 60 * dt;
  }
  world.particles = world.particles.filter((p) => p.life > 0);
}
