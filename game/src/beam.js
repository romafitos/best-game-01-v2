// TIDEKEEPER v2 — beam: aiming, focus, flare, and how lit boats answer.
// One job: everything the light does, and the steering it causes. The
// renderer only asks "is this boat lit"; the world only asks "where does
// this boat go". All of the numbers live in config.js.

import { LAMP, BEAM, GULL, HARBOUR, HORIZON_Y } from './config.js';

// Ease the beam toward the pointer instead of snapping: the lamp has weight,
// so a flick of the wrist never whips the light across the whole sea.
export function aimBeamAt(currentAngle, aimX, aimY) {
  const target = Math.atan2(aimY - LAMP.y, aimX - LAMP.x);
  const clamped = Math.max(-0.75, Math.min(1.05, target));
  let diff = clamped - currentAngle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return currentAngle + diff * 0.22;
}

// Beam settings for the world's current focus mode.
export function beamSettings(world) {
  return world.focus ? BEAM.narrow : BEAM.wide;
}

// Angular distance between two directions, always the short way round.
function angleGap(a, b) {
  let d = Math.abs(a - b);
  if (d > Math.PI) d = Math.PI * 2 - d;
  return d;
}

// Does a gull cut the line from the lamp to this boat? A gull in the way
// throws a shadow: the boat goes dark even inside the cone.
export function gullBlocks(world, boat) {
  const bx = boat.x - LAMP.x, by = boat.y - LAMP.y;
  const len2 = bx * bx + by * by + 1;
  for (const g of world.gulls) {
    const t = ((g.x - LAMP.x) * bx + (g.y - LAMP.y) * by) / len2;
    if (t < 0.05 || t > 0.95) continue;
    const px = LAMP.x + bx * t, py = LAMP.y + by * t;
    if (Math.hypot(g.x - px, g.y - py) < GULL.blockRadius) return true;
  }
  return false;
}

// Is this boat inside the beam cone, in range, and not gull-shadowed?
export function isBoatLit(world, boat) {
  const dx = boat.x - LAMP.x, dy = boat.y - LAMP.y;
  if (Math.hypot(dx, dy) > beamSettings(world).range) return false;
  if (angleGap(Math.atan2(dy, dx), world.beamAngle) > beamSettings(world).halfAngle) return false;
  return !gullBlocks(world, boat);
}

// Would this boat be lit if the beam pointed at `angle` instead?
export function isLitAtAngle(world, boat, angle) {
  const dx = boat.x - LAMP.x, dy = boat.y - LAMP.y;
  if (Math.hypot(dx, dy) > beamSettings(world).range) return false;
  if (angleGap(Math.atan2(dy, dx), angle) > beamSettings(world).halfAngle) return false;
  return !gullBlocks(world, boat);
}

// Is the lane a lit boat would follow under this beam angle clear of rocks?
// The boat converges on the centreline over ~150 px of travel, so a rock
// right ahead counts even when the centreline far ahead is clear of it.
export function pathIsClear(world, boat, angle) {
  const slope = Math.tan(angle);
  for (const ahead of [0, 30, 60, 100, 150, 220, 300]) {
    const x = boat.x + ahead;
    if (x > HARBOUR.x) break;
    const centreY = Math.max(HORIZON_Y + 40, Math.min(440, LAMP.y + slope * (x - LAMP.x)));
    const y = boat.y + (centreY - boat.y) * Math.min(1, ahead / 150);
    for (const rock of world.rocks) {
      if (Math.abs(rock.x - x) > 70) continue;
      if (Math.hypot(rock.x - x, rock.y - y) < rock.r + boat.r + 12) return false;
    }
  }
  return true;
}

// How much trouble is this boat in? Near rocks ahead score high, an
// unlit boat scores extra, and distance from home adds a slow urgency.
export function dangerOf(world, boat) {
  let danger = 0;
  for (const rock of world.rocks) {
    if (rock.x < boat.x - 10) continue;
    const d = Math.hypot(rock.x - boat.x, rock.y - boat.y);
    if (d < 260) danger += (260 - d) / 10;
    if (d < 110) danger += (110 - d) * 0.9;
  }
  danger += (HARBOUR.x - boat.x) / 400;
  if (!boat.lit) danger += 6;
  return danger;
}

// Move one boat for a step. A lit boat steers toward the beam's centreline
// a little ahead of itself and makes way for the harbour; an unlit boat
// crawls on at half speed and drifts down with the current.
export function steerBoat(world, boat, dt) {
  if (boat.lit) {
    const along = Math.max(0, boat.x + 120 - LAMP.x);
    const centreY = Math.max(
      HORIZON_Y + 40,
      Math.min(440, LAMP.y + Math.tan(world.beamAngle) * along),
    );
    const dy = centreY - boat.y;
    boat.x += boat.speed * dt;
    boat.y += Math.max(-95, Math.min(95, dy * 2.0)) * dt;
  } else {
    boat.x += boat.speed * 0.5 * dt;
    boat.y += world.current * boat.drift * 0.5 * dt;
  }
  boat.y = Math.max(HORIZON_Y + 20, Math.min(468, boat.y));
}

// Fire a flare: it lights the rocks and every boat for a short while, and
// scares the gulls off in the opposite direction.
export function fireFlare(world) {
  if (world.flares <= 0 || world.state !== 'play') return false;
  world.flares -= 1;
  world.flareTimer = 3;
  world.flareLitTimer = 1.5;
  for (const g of world.gulls) g.vx = -g.vx;
  return true;
}

// The boat in the most danger: nearest a rock ahead, or longest unlit.
// The autopilot aims at this one.
export function mostEndangeredBoat(world) {
  let best = null, bestScore = -Infinity;
  for (const boat of world.boats) {
    if (boat.saved || boat.wrecked) continue;
    const danger = dangerOf(world, boat);
    if (danger > bestScore) { bestScore = danger; best = boat; }
  }
  return best;
}

// Aim point that threads the target boat through the nearest gap between
// rocks in its path, instead of straight at the boat (which may sit behind
// a rock). The aim is solved so the beam's centreline passes through the
// chosen lane AT the boat's x — a boat steers toward the centreline where
// it is, not where the beam points, so aiming at the lane itself would
// steer it low. The beam stays close enough to the boat to light it: the
// aim starts from the boat's own angle from the lamp and moves at most
// 80% of the cone's half-angle toward the lane.
export function gapAimPoint(world, boat) {
  const ahead = world.rocks.filter((r) => r.x > boat.x - 20 && r.x < boat.x + 340);
  if (!ahead.length) return { x: boat.x + 200, y: boat.y };
  const lanes = [boat.y];
  for (const r of ahead) lanes.push(r.y - r.r - 44, r.y + r.r + 44);
  let bestLane = boat.y, bestScore = -Infinity;
  for (const lane of lanes) {
    if (lane < HORIZON_Y + 30 || lane > 460) continue;
    let clearance = Infinity;
    for (const r of ahead) {
      clearance = Math.min(clearance, Math.hypot(r.x - (boat.x + 120), r.y - lane) - r.r);
    }
    const score = clearance - Math.abs(lane - boat.y) * 0.25;
    if (score > bestScore) { bestScore = score; bestLane = lane; }
  }
  const cfg = beamSettings(world);
  const boatAng = Math.atan2(boat.y - LAMP.y, boat.x - LAMP.x);
  const laneAng = Math.atan2(bestLane - LAMP.y, boat.x - LAMP.x);
  const edge = cfg.halfAngle * 0.8;
  let theta = boatAng + Math.max(-edge, Math.min(edge, laneAng - boatAng));
  theta = Math.max(-0.75, Math.min(1.05, theta));
  return { x: LAMP.x + Math.cos(theta) * 400, y: LAMP.y + Math.sin(theta) * 400 };
}
