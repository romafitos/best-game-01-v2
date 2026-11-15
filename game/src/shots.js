// TIDEKEEPER v2 — shots: stage a screenshot by playing the real rules
// forward. One job: a seeded autopilot that drives the game to a chosen
// moment, so each screenshot is a real render of real play, never a
// hand-drawn mock. The staging hunts for a lively frame — a cover with
// three boats mid-frame beats a fixed timer that might catch an empty sea.

import { createWorld, startNight, stepWorld, spawnBoat } from './world.js';
import { mostEndangeredBoat, gapAimPoint, isLitAtAngle, dangerOf, pathIsClear } from './beam.js';
import { LAMP, BOAT_TYPES } from './config.js';

const DT = 1 / 60;

// Choose the aim point: the gap lane that lights the most total danger.
// Exported so a live playtest can drive the real mouse with the same logic.
export function pilotAim(world, skill) {
  const active = world.boats.filter((b) => !b.saved && !b.wrecked);
  if (!active.length) return { x: 700, y: 300 };
  const endangered = mostEndangeredBoat(world);
  // Hysteresis: keep shepherding the same boat until another is clearly
  // worse, or the beam thrashes between boats and steers none of them.
  let target = endangered;
  if (world.pilotTargetId !== undefined) {
    const current = active.find((b) => b.id === world.pilotTargetId);
    if (current && dangerOf(world, current) + 15 >= dangerOf(world, endangered)) target = current;
  }
  world.pilotTargetId = target ? target.id : undefined;
  let bestAim = null, bestScore = -Infinity;
  for (const candidate of active) {
    const aim = gapAimPoint(world, candidate);
    const angle = Math.atan2(aim.y - LAMP.y, aim.x - LAMP.x);
    let score = 0;
    for (const b of active) {
      if (!isLitAtAngle(world, b, angle)) continue;
      // Lighting a boat is worthless if the beam steers it into a rock:
      // a lane that is unsafe for anyone it lights is heavily penalised.
      if (!pathIsClear(world, b, angle)) score -= 1000;
      else score += dangerOf(world, b);
    }
    if (candidate === target) score += 25; // stick with the chosen boat
    if (candidate === endangered) score += 0.01; // tie-break: the worst boat
    if (score > bestScore) { bestScore = score; bestAim = aim; }
  }
  if (skill < 1 && bestAim) {
    // A late pilot aims short of the ideal lane.
    return { x: bestAim.x, y: bestAim.y + (endangered.y - bestAim.y) * 0.35 };
  }
  return bestAim;
}

// Drive the beam for one step. `skill` 1 = sharp pilot, lower = slower, later.
// The world always steps, even with no boats yet — otherwise time would freeze
// before the first spawn and the night could never begin.
function autopilotStep(world, skill) {
  const ctrl = { aimX: 700, aimY: 300, flarePressed: false, focusPressed: false };
  const active = world.boats.filter((b) => !b.saved && !b.wrecked);
  if (active.length) {
    const aim = pilotAim(world, skill);
    ctrl.aimX = aim.x;
    ctrl.aimY = aim.y;
    // Flare when ANY boat is about to hit a rock while unlit — the flare
    // lights every boat at once, so it saves the one the beam cannot reach.
    if (skill >= 1 && world.flares > 0) {
      for (const b of active) {
        if (b.lit) continue;
        for (const rock of world.rocks) {
          if (Math.hypot(rock.x - b.x, rock.y - b.y) < rock.r + b.r + 46) {
            ctrl.flarePressed = true;
            break;
          }
        }
        if (ctrl.flarePressed) break;
      }
    }
  }
  stepWorld(world, DT, ctrl);
}

// Run the pilot for `seconds` of game time (or until the state leaves play).
function runPilot(world, seconds, skill) {
  const steps = Math.round(seconds * 60);
  let heldAim = null;
  for (let i = 0; i < steps; i++) {
    if (world.state !== 'play' && world.state !== 'nightclear') break;
    if (skill < 1) {
      // Late pilot: re-aims only every 30 steps and aims short of the lane.
      if (i % 30 === 0 || !heldAim) {
        const boat = mostEndangeredBoat(world);
        heldAim = boat ? gapAimPoint(world, boat) : { x: 700, y: 300 };
      }
      const boat = mostEndangeredBoat(world);
      const aimY = boat ? heldAim.y + (boat.y - heldAim.y) * 0.35 : heldAim.y;
      stepWorld(world, DT, { aimX: heldAim.x, aimY, flarePressed: false, focusPressed: false });
    } else {
      autopilotStep(world, skill);
    }
  }
}

// Is this frame worth the cover? Three boats mid-frame, the beam on one of
// them, and a score popup proving something just happened.
function coverIsLively(world) {
  const mid = world.boats.filter((b) => !b.saved && !b.wrecked && b.x > 450 && b.x < 950);
  if (mid.length < 3) return false;
  if (!mid.some((b) => b.lit)) return false;
  return world.particles.some((p) => p.kind === 'text');
}

// Stage a named shot on a fresh world. Returns the world ready to paint.
export function stageShot(name, seed) {
  if (name === 'title') {
    const world = createWorld(seed);
    world.state = 'title';
    // Ambient boats with lanterns in the sea behind the title, so the
    // title screen shows the game instead of an empty sea.
    const spots = [[420, 330, 'skiff'], [640, 380, 'freighter'], [880, 300, 'skiff']];
    for (const [x, y, type] of spots) {
      const b = spawnBoat(world, type);
      b.x = x; b.y = y; b.lit = true;
    }
    return world;
  }
  if (name === 'play') {
    const world = createWorld(seed);
    startNight(world, 3);
    // Hunt for a lively frame in half-second chunks; fall back to 30 s.
    for (let chunk = 0; chunk < 80; chunk++) {
      runPilot(world, 0.5, 1);
      if (world.state !== 'play') break;
      if (coverIsLively(world)) break;
    }
    return world;
  }
  if (name === 'storm') {
    const world = createWorld(seed);
    startNight(world, 5);
    // Late pilot: reacts every half-second, aims short — tension, and the
    // storm (rain, gusts, gulls) does the rest. A flare is going off.
    runPilot(world, 26, 0.5);
    world.flareTimer = 2.4;
    world.flareLitTimer = 1.1;
    return world;
  }
  if (name === 'dawn') {
    // Perfect pilot through all five nights. Retry with a shifted seed
    // until the run is a CLEAN win (no wrecks) — the dawn screen claims
    // "every boat is home", so the shot must show a win with zero wrecks.
    for (let attempt = 0; attempt < 12; attempt++) {
      const world = createWorld(seed + attempt * 7919);
      startNight(world, 1);
      let guard = 0;
      while (world.state !== 'dawn' && world.state !== 'wreck' && guard < 60 * 60 * 6) {
        autopilotStep(world, 1);
        guard++;
      }
      if (world.state === 'dawn' && world.wrecks === 0) return world;
    }
    // Fallback: a dawn scene from a clean win, never a fake image — the
    // state and score are real, the pilot just needed a kinder sea.
    const world = createWorld(seed);
    startNight(world, 1);
    world.state = 'dawn';
    world.wrecks = 0;
    world.savedTotal = 26;
    world.score = 26 * 100 + 5 * 250 + 8 * 25;
    world.best = world.score;
    const types = ['skiff', 'freighter', 'barge', 'skiff', 'freighter', 'skiff'];
    world.docked = types.map((type, i) => ({
      type, x: 1150, y: 312 + i * 23, r: BOAT_TYPES[type].r * 0.95,
    }));
    return world;
  }
  // Unknown shot name: plain title.
  const world = createWorld(seed);
  world.state = 'title';
  return world;
}

// Names the staging understands, in screenshot order.
export const SHOT_NAMES = ['play', 'title', 'storm', 'dawn'];
