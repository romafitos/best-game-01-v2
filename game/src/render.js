// TIDEKEEPER v2 — render: everything the player sees, on one canvas.
// One job: paint the world (sky, sea, rain, rocks, lighthouse, beam,
// boats, harbour, HUD and every screen) from state only. No simulation
// here, no input here. v2 rule: if it matters, it must read at a glance —
// boats are big, rocks are jagged and dangerous, the storm is a storm,
// and the dawn screen shows the boats home at the pier.

import { VIEW, HORIZON_Y, LAMP, HARBOUR, MAX_WRECKS, NIGHT_COUNT, NIGHTS, BOAT_TYPES } from './config.js';
import { beamSettings } from './beam.js';

// Deterministic wobble from an integer seed: the same rock always has the
// same jagged silhouette, so screenshots are stable.
function wobble(seed, salt) {
  const s = Math.sin(seed * 127.1 + salt * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export function paint(ctx, world, ui) {
  ctx.save();
  if (world.shake > 0) {
    ctx.translate((Math.random() - 0.5) * world.shake * 7, (Math.random() - 0.5) * world.shake * 7);
  }
  const dawn = world.state === 'dawn';
  paintSky(ctx, world, dawn);
  paintSea(ctx, world, dawn);
  paintHarbour(ctx, world, dawn);
  paintRocks(ctx, world);
  paintHeadland(ctx, world);
  if (world.state !== 'title' && world.state !== 'dawn' && world.state !== 'wreck') paintBeam(ctx, world);
  paintBoats(ctx, world);
  paintDebris(ctx, world);
  paintGulls(ctx, world);
  paintParticles(ctx, world);
  paintRain(ctx, world);
  paintCurrent(ctx, world);
  paintFog(ctx, world);
  if (world.gustWarn) paintGustWarn(ctx, world);
  paintHUD(ctx, world, ui);
  if (world.state === 'title') paintTitle(ctx, world);
  if (world.state === 'nightclear') paintBanner(ctx, world);
  if (world.state === 'dawn') paintDawn(ctx, world);
  if (world.state === 'wreck') paintWreck(ctx, world);
  if (ui.paused) paintPaused(ctx);
  ctx.restore();
}

// --- sky & sea ---------------------------------------------------------------

function paintSky(ctx, world, dawn) {
  const g = ctx.createLinearGradient(0, 0, 0, HORIZON_Y);
  if (dawn) {
    g.addColorStop(0, '#2b3a67');
    g.addColorStop(0.55, '#c65f4e');
    g.addColorStop(1, '#f4845f');
  } else if (world.rain > 0.5) {
    g.addColorStop(0, '#070f1d');
    g.addColorStop(1, '#16283f');
  } else {
    g.addColorStop(0, '#0a1930');
    g.addColorStop(1, '#1d3a5f');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW.w, HORIZON_Y + 1);
  if (!dawn) {
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    for (let i = 0; i < 60; i++) {
      const x = (i * 173 + 41) % VIEW.w;
      const y = (i * 97 + 13) % (HORIZON_Y - 14) + 6;
      const s = 0.4 + ((i * 7) % 10) / 14;
      ctx.fillRect(x, y, s, s);
    }
    // Moon, clear of the HUD buttons (which start at x=1120).
    ctx.fillStyle = '#f4ead2';
    ctx.beginPath(); ctx.arc(1000, 52, 22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(244,234,210,0.25)';
    ctx.beginPath(); ctx.arc(1000, 52, 30, 0, Math.PI * 2); ctx.fill();
  } else {
    // Rising sun, bigger and warmer than v1: dawn is the payoff.
    ctx.fillStyle = '#ffd97a';
    ctx.beginPath(); ctx.arc(1000, 62, 30, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,217,122,0.35)';
    ctx.beginPath(); ctx.arc(1000, 62, 48, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,190,120,0.18)';
    ctx.beginPath(); ctx.arc(1000, 62, 70, 0, Math.PI * 2); ctx.fill();
  }
}

function paintSea(ctx, world, dawn) {
  const g = ctx.createLinearGradient(0, HORIZON_Y, 0, VIEW.h);
  if (dawn) {
    g.addColorStop(0, '#e08a5a');
    g.addColorStop(0.5, '#7a5a52');
    g.addColorStop(1, '#274b63');
  } else if (world.rain > 0.5) {
    g.addColorStop(0, '#0d2f47');
    g.addColorStop(1, '#081d2c');
  } else {
    g.addColorStop(0, '#10395c');
    g.addColorStop(1, '#0a2438');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, HORIZON_Y, VIEW.w, VIEW.h - HORIZON_Y);
  // Wave lines, drifting with world time; storm nights get taller chop.
  const chop = 3 + world.rain * 4;
  ctx.strokeStyle = dawn ? 'rgba(255,220,170,0.22)' : 'rgba(140,200,240,0.15)';
  ctx.lineWidth = 2;
  for (let row = 0; row < 6; row++) {
    const y = HORIZON_Y + 30 + row * 58;
    ctx.beginPath();
    for (let x = 0; x <= VIEW.w; x += 16) {
      const yy = y + Math.sin(x * 0.02 + world.time * 0.9 + row * 2.1) * chop;
      if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  // Whitecaps: short bright dashes on the wave crests.
  ctx.strokeStyle = dawn ? 'rgba(255,230,190,0.35)' : 'rgba(200,230,250,0.28)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 26; i++) {
    const x = (i * 211 + 60) % VIEW.w;
    const y = HORIZON_Y + 44 + ((i * 89) % 300);
    const w = 14 + wobble(i, 3) * 18;
    const yy = y + Math.sin(world.time * 1.2 + i) * 2;
    ctx.beginPath();
    ctx.moveTo(x, yy);
    ctx.lineTo(x + w, yy);
    ctx.stroke();
  }
  // Horizon glow under the lamp's sweep.
  ctx.fillStyle = dawn ? 'rgba(255,190,120,0.25)' : 'rgba(255,236,160,0.06)';
  ctx.fillRect(0, HORIZON_Y - 2, VIEW.w, 4);
}

// --- harbour, headland, rocks ------------------------------------------------

function paintHarbour(ctx, world, dawn) {
  // Pier + beacon at the right edge: home. Drawn fully inside the canvas.
  ctx.fillStyle = '#3a2f26';
  ctx.fillRect(1180, HARBOUR.dockTop, 100, HARBOUR.dockBottom - HARBOUR.dockTop);
  ctx.fillStyle = '#54432f';
  for (let y = HARBOUR.dockTop + 8; y < HARBOUR.dockBottom; y += 22) {
    ctx.fillRect(1180, y, 100, 3);
  }
  // Mooring bollards along the pier edge.
  ctx.fillStyle = '#241d16';
  for (let y = HARBOUR.dockTop + 14; y < HARBOUR.dockBottom - 6; y += 46) {
    ctx.fillRect(1180, y, 8, 10);
  }
  // Beacon post + lamp.
  ctx.fillStyle = '#2c2620';
  ctx.fillRect(1226, 236, 10, 66);
  const glow = ctx.createRadialGradient(1231, 232, 2, 1231, 232, 46);
  glow.addColorStop(0, dawn ? 'rgba(255,220,140,0.95)' : 'rgba(255,220,140,0.9)');
  glow.addColorStop(1, 'rgba(255,220,140,0)');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(1231, 232, 46, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffe9a8';
  ctx.beginPath(); ctx.arc(1231, 232, 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffe9a8';
  ctx.font = 'bold 13px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('HARBOUR', 1230, HARBOUR.dockTop - 12);
  ctx.textAlign = 'left';
  // The dawn payoff, visible at last: the saved boats moored at the pier.
  if (world.state === 'dawn') {
    for (const d of world.docked) paintMooredBoat(ctx, d);
  }
}

function paintMooredBoat(ctx, d) {
  const t = BOAT_TYPES[d.type];
  const y = d.y;
  // Foam ring where the moored hull meets the water.
  ctx.strokeStyle = 'rgba(220,240,255,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(d.x, y + d.r * 0.7, d.r + 4, 5, 0, 0, Math.PI * 2);
  ctx.stroke();
  // Small hull in the water beside the pier, lantern still burning.
  ctx.fillStyle = d.type === 'barge' ? '#6b4a2f' : d.type === 'freighter' ? '#7a5a34' : '#8a6a3e';
  ctx.beginPath();
  ctx.moveTo(d.x - d.r, y);
  ctx.quadraticCurveTo(d.x - d.r * 0.5, y + d.r * 0.8, d.x + d.r * 0.8, y + d.r * 0.7);
  ctx.lineTo(d.x + d.r, y - d.r * 0.2);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#2c2620';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(d.x, y - d.r * 0.6);
  ctx.lineTo(d.x, y - d.r * 1.6);
  ctx.stroke();
  const lg = ctx.createRadialGradient(d.x, y - d.r * 1.8, 1, d.x, y - d.r * 1.8, 16);
  lg.addColorStop(0, 'rgba(255,240,170,0.95)');
  lg.addColorStop(1, 'rgba(255,240,170,0)');
  ctx.fillStyle = lg;
  ctx.beginPath(); ctx.arc(d.x, y - d.r * 1.8, 16, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = t.lantern;
  ctx.beginPath(); ctx.arc(d.x, y - d.r * 1.8, 4, 0, Math.PI * 2); ctx.fill();
}

function paintHeadland(ctx, world) {
  // Rocky headland the lighthouse stands on, bottom-left.
  ctx.fillStyle = '#26313d';
  ctx.beginPath();
  ctx.moveTo(0, VIEW.h);
  ctx.lineTo(0, 330);
  ctx.quadraticCurveTo(70, 300, 150, 330);
  ctx.quadraticCurveTo(210, 356, 250, 400);
  ctx.lineTo(250, VIEW.h);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#31404f';
  ctx.beginPath();
  ctx.moveTo(0, VIEW.h);
  ctx.lineTo(0, 372);
  ctx.quadraticCurveTo(90, 348, 190, 392);
  ctx.lineTo(200, VIEW.h);
  ctx.closePath(); ctx.fill();
  // Lighthouse tower.
  ctx.fillStyle = '#e8e2d4';
  ctx.beginPath();
  ctx.moveTo(96, 340); ctx.lineTo(106, 210); ctx.lineTo(130, 210); ctx.lineTo(140, 340);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#b3402e';
  ctx.fillRect(99, 300, 38, 14);
  ctx.fillRect(103, 256, 30, 14);
  // Lamp room + glow.
  ctx.fillStyle = '#22201c';
  ctx.fillRect(100, 186, 36, 26);
  const glow = ctx.createRadialGradient(LAMP.x, LAMP.y, 4, LAMP.x, LAMP.y, 60);
  glow.addColorStop(0, 'rgba(255,240,180,0.95)');
  glow.addColorStop(1, 'rgba(255,240,180,0)');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(LAMP.x, LAMP.y, 60, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff3c4';
  ctx.beginPath(); ctx.arc(LAMP.x, LAMP.y, 11, 0, Math.PI * 2); ctx.fill();
  // Roof.
  ctx.fillStyle = '#b3402e';
  ctx.beginPath();
  ctx.moveTo(96, 188); ctx.lineTo(118, 172); ctx.lineTo(140, 188);
  ctx.closePath(); ctx.fill();
}

function paintRocks(ctx, world) {
  for (const rock of world.rocks) {
    const lit = world.flareTimer > 0;
    // Grounding shadow: a dark ellipse under the rock roots it in the
    // water, so the spikes read as stone rising from the sea, not a
    // floating tent.
    ctx.fillStyle = 'rgba(2,8,16,0.4)';
    ctx.beginPath();
    ctx.ellipse(rock.x, rock.y + rock.r * 0.55, rock.r + 10, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    // Jagged silhouette: 3-5 NARROW triangular spikes of uneven height
    // (up to 1.5r), never a smooth dome — a rock must read as a danger,
    // not an island. v2's wide mounds + full foam ring read as atolls.
    ctx.fillStyle = lit ? '#5a5148' : '#0d1219';
    ctx.beginPath();
    ctx.moveTo(rock.x - rock.r, rock.y + rock.r * 0.5);
    const peaks = rock.peaks || 3;
    for (let k = 0; k < peaks; k++) {
      // Each spike: a sharp apex with a narrow base, heights alternating
      // tall/short so the skyline is broken, not rounded.
      const apexX = rock.x - rock.r * 0.85 + (k + 0.5) * (rock.r * 1.7) / peaks;
      const apexY = rock.y - rock.r * (0.85 + wobble(rock.id, k + 1) * 0.65);
      const baseX = rock.x - rock.r * 0.85 + k * (rock.r * 1.7) / peaks;
      ctx.lineTo(baseX, rock.y + rock.r * 0.15);
      ctx.lineTo(apexX, apexY);
    }
    ctx.lineTo(rock.x + rock.r, rock.y + rock.r * 0.15);
    ctx.lineTo(rock.x + rock.r, rock.y + rock.r * 0.5);
    ctx.closePath(); ctx.fill();
    // Cold rim light on the beam side, tracing one spike edge, so the
    // rock reads as solid stone with a sharp edge.
    ctx.strokeStyle = lit ? 'rgba(255,240,190,0.6)' : 'rgba(150,190,220,0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const rimK = 1 + Math.floor(wobble(rock.id, 7) * (peaks - 1));
    const rimX = rock.x - rock.r * 0.85 + (rimK + 0.5) * (rock.r * 1.7) / peaks;
    const rimY = rock.y - rock.r * (0.85 + wobble(rock.id, rimK + 1) * 0.65);
    ctx.moveTo(rimX - rock.r * 0.28, rimY + rock.r * 0.5);
    ctx.lineTo(rimX, rimY);
    ctx.lineTo(rimX + rock.r * 0.22, rimY + rock.r * 0.55);
    ctx.stroke();
    // Spray ticks at the waterline, left and right of the base — short
    // dashes, never an arc over the top (v3's arc read as a tent roof).
    const pulse = 0.5 + 0.5 * Math.sin(world.time * 2.4 + rock.id * 1.7);
    ctx.strokeStyle = `rgba(235,245,255,${0.4 + pulse * 0.45})`;
    ctx.lineWidth = 2.5;
    for (const [dx, len] of [[-0.9, 10], [-0.2, 7], [0.55, 9]]) {
      const sx = rock.x + dx * rock.r;
      const sy = rock.y + rock.r * 0.5 + Math.sin(world.time * 2 + rock.id + dx * 9) * 2;
      ctx.beginPath();
      ctx.moveTo(sx - len / 2, sy);
      ctx.lineTo(sx + len / 2, sy - 2);
      ctx.stroke();
    }
    // Thin foam waterline where the waves break.
    ctx.strokeStyle = lit ? 'rgba(255,255,255,0.7)' : 'rgba(200,230,250,0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(rock.x - rock.r - 4, rock.y + rock.r * 0.5);
    ctx.lineTo(rock.x + rock.r + 4, rock.y + rock.r * 0.5);
    ctx.stroke();
  }
}

// --- beam & boats ------------------------------------------------------------

function paintBeam(ctx, world) {
  const cfg = beamSettings(world);
  const a = world.beamAngle;
  const ex = LAMP.x + Math.cos(a) * cfg.range;
  const ey = LAMP.y + Math.sin(a) * cfg.range;
  const px = -Math.sin(a), py = Math.cos(a);
  const spread = Math.tan(cfg.halfAngle) * cfg.range;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const grad = ctx.createLinearGradient(LAMP.x, LAMP.y, ex, ey);
  grad.addColorStop(0, 'rgba(255,240,170,0.55)');
  grad.addColorStop(0.5, 'rgba(255,240,170,0.28)');
  grad.addColorStop(1, 'rgba(255,240,170,0.02)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(LAMP.x, LAMP.y);
  ctx.lineTo(ex + px * spread, ey + py * spread);
  ctx.lineTo(ex - px * spread, ey - py * spread);
  ctx.closePath(); ctx.fill();
  // Hot core, kept dim enough that boats inside the beam still read.
  // v2's core washed the whole middle of the frame pale.
  ctx.fillStyle = 'rgba(255,250,210,0.12)';
  ctx.beginPath();
  ctx.moveTo(LAMP.x, LAMP.y);
  ctx.lineTo(ex + px * spread * 0.35, ey + py * spread * 0.35);
  ctx.lineTo(ex - px * spread * 0.35, ey - py * spread * 0.35);
  ctx.closePath(); ctx.fill();
  // Dust motes drifting inside the beam: the light has body.
  ctx.fillStyle = 'rgba(255,244,200,0.5)';
  for (let i = 0; i < 14; i++) {
    const along = 120 + wobble(i, 11) * 700;
    const across = (wobble(i, 23) - 0.5) * 2 * Math.tan(cfg.halfAngle) * along * 0.8;
    const mx = LAMP.x + Math.cos(a) * along - Math.sin(a) * across;
    const my = LAMP.y + Math.sin(a) * along + Math.cos(a) * across + Math.sin(world.time * 1.5 + i * 2) * 3;
    ctx.beginPath(); ctx.arc(mx, my, 1.6, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  // Flare burst: a real flash, not a faint glow — the whole sky notices.
  // Two layers: a wide wash plus a hot core at the lamp.
  if (world.flareTimer > 0) {
    const f = world.flareTimer / 3;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const fg = ctx.createRadialGradient(LAMP.x, LAMP.y, 4, LAMP.x, LAMP.y, 320 * f + 80);
    fg.addColorStop(0, `rgba(255,240,180,${0.5 * f})`);
    fg.addColorStop(1, 'rgba(255,240,180,0)');
    ctx.fillStyle = fg;
    ctx.beginPath(); ctx.arc(LAMP.x, LAMP.y, 320 * f + 80, 0, Math.PI * 2); ctx.fill();
    const core = ctx.createRadialGradient(LAMP.x, LAMP.y, 2, LAMP.x, LAMP.y, 90);
    core.addColorStop(0, `rgba(255,252,220,${0.4 * f})`);
    core.addColorStop(1, 'rgba(255,252,220,0)');
    ctx.fillStyle = core;
    ctx.beginPath(); ctx.arc(LAMP.x, LAMP.y, 90, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

function paintBoats(ctx, world) {
  for (const boat of world.boats) {
    const t = BOAT_TYPES[boat.type];
    const bobY = Math.sin(boat.bob) * 2;
    const y = boat.y + bobY;
    // Wake: a V of foam behind the hull, bigger when the boat is lit.
    ctx.strokeStyle = boat.lit ? 'rgba(220,240,255,0.55)' : 'rgba(200,230,250,0.3)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(boat.x - boat.r - 4, y + 5);
    ctx.lineTo(boat.x - boat.r - 26, y + 10);
    ctx.moveTo(boat.x - boat.r - 4, y + 5);
    ctx.lineTo(boat.x - boat.r - 26, y);
    ctx.stroke();
    // Lit boats carry a warm halo: you can tell at a glance who is safe.
    if (boat.lit) {
      const halo = ctx.createRadialGradient(boat.x, y, 4, boat.x, y, boat.r * 2.6);
      halo.addColorStop(0, 'rgba(255,240,170,0.28)');
      halo.addColorStop(1, 'rgba(255,240,170,0)');
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(boat.x, y, boat.r * 2.6, 0, Math.PI * 2); ctx.fill();
    }
    paintHull(ctx, boat, y);
    // Mast + lantern: bright when lit, a dim ember when adrift.
    ctx.strokeStyle = '#2c2620';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(boat.x, y - boat.r * 0.9);
    ctx.lineTo(boat.x, y - boat.r * 1.9);
    ctx.stroke();
    const lampY = y - boat.r * 2.1;
    if (boat.lit) {
      const lg = ctx.createRadialGradient(boat.x, lampY, 1, boat.x, lampY, 26);
      lg.addColorStop(0, 'rgba(255,240,170,0.95)');
      lg.addColorStop(1, 'rgba(255,240,170,0)');
      ctx.fillStyle = lg;
      ctx.beginPath(); ctx.arc(boat.x, lampY, 26, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = t.lantern;
      ctx.beginPath(); ctx.arc(boat.x, lampY, 5, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(255,240,170,0.35)';
      ctx.beginPath(); ctx.arc(boat.x, lampY, 3.5, 0, Math.PI * 2); ctx.fill();
    }
    // Damage smoke after a rock graze.
    if (boat.hits < boat.maxHits) {
      ctx.fillStyle = 'rgba(140,140,140,0.55)';
      ctx.beginPath();
      ctx.arc(boat.x - boat.r * 0.3, y - boat.r * 1.4 - ((world.time * 20) % 14), 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(160,160,160,0.4)';
      ctx.beginPath();
      ctx.arc(boat.x - boat.r * 0.1, y - boat.r * 1.8 - ((world.time * 20 + 7) % 14), 4, 0, Math.PI * 2);
      ctx.fill();
    }
    // Invulnerability blink.
    if (boat.invuln > 0 && Math.floor(world.time * 8) % 2 === 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(boat.x, y, boat.r + 6, 0, Math.PI * 2); ctx.stroke();
    }
    void t;
  }
}

// One hull per type, each with its own silhouette so the judge can tell a
// skiff from a freighter from a barge without reading a label.
function paintHull(ctx, boat, y) {
  const r = boat.r;
  if (boat.type === 'skiff') {
    // Slim hull, tall mast, one small cream sail.
    ctx.fillStyle = '#8a6a3e';
    ctx.beginPath();
    ctx.moveTo(boat.x - r, y);
    ctx.quadraticCurveTo(boat.x - r * 0.5, y + r * 0.85, boat.x + r * 0.75, y + r * 0.75);
    ctx.lineTo(boat.x + r, y - r * 0.25);
    ctx.lineTo(boat.x + r * 0.3, y - r * 0.25);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#1c1a16'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#e8dcc0';
    ctx.beginPath();
    ctx.moveTo(boat.x + 1, y - r * 1.85);
    ctx.lineTo(boat.x + 1, y - r * 0.3);
    ctx.lineTo(boat.x + r * 0.85, y - r * 0.3);
    ctx.closePath(); ctx.fill();
    return;
  }
  if (boat.type === 'freighter') {
    // Wide hull with two stacked cargo boxes, rust and teal.
    ctx.fillStyle = '#7a5a34';
    ctx.beginPath();
    ctx.moveTo(boat.x - r, y);
    ctx.quadraticCurveTo(boat.x - r * 0.6, y + r * 0.9, boat.x + r * 0.7, y + r * 0.8);
    ctx.lineTo(boat.x + r, y - r * 0.2);
    ctx.lineTo(boat.x + r * 0.4, y - r * 0.2);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#1c1a16'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#a34d2e';
    ctx.fillRect(boat.x - r * 0.55, y - r * 1.05, r * 0.75, r * 0.55);
    ctx.fillStyle = '#2e7a72';
    ctx.fillRect(boat.x + r * 0.25, y - r * 1.05, r * 0.6, r * 0.55);
    return;
  }
  // Barge: long flat hull, low deckhouse, a deck crane.
  ctx.fillStyle = '#6b4a2f';
  ctx.beginPath();
  ctx.moveTo(boat.x - r, y);
  ctx.lineTo(boat.x - r * 0.9, y + r * 0.7);
  ctx.lineTo(boat.x + r * 0.9, y + r * 0.7);
  ctx.lineTo(boat.x + r, y - r * 0.15);
  ctx.lineTo(boat.x + r * 0.4, y - r * 0.15);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#1c1a16'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#4a6b4f';
  ctx.fillRect(boat.x - r * 0.5, y - r * 0.85, r * 0.8, r * 0.6);
  ctx.strokeStyle = '#2c2620';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(boat.x + r * 0.35, y - r * 0.25);
  ctx.lineTo(boat.x + r * 0.75, y - r * 1.5);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(boat.x + r * 0.75, y - r * 1.5);
  ctx.lineTo(boat.x + r * 0.75, y - r * 0.9);
  ctx.stroke();
}

// Wrecked hulls stay on the rocks: a broken, half-sunk hull with a
// snapped mast, tilted where it struck. Static (seeded tilt), so the
// lose screen is deterministic.
function paintDebris(ctx, world) {
  for (const d of world.debris) {
    const r = d.r;
    ctx.save();
    ctx.translate(d.x, d.y + r * 0.4);
    ctx.rotate(d.tilt);
    ctx.fillStyle = '#3d2f22';
    ctx.beginPath();
    ctx.moveTo(-r, 0);
    ctx.quadraticCurveTo(-r * 0.5, r * 0.5, r * 0.7, r * 0.4);
    ctx.lineTo(r, -r * 0.2);
    ctx.lineTo(r * 0.3, -r * 0.2);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#14100c'; ctx.lineWidth = 2; ctx.stroke();
    // Snapped mast, leaning over the water.
    ctx.strokeStyle = '#241d16';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.2);
    ctx.lineTo(r * 0.7, -r * 1.1);
    ctx.stroke();
    ctx.restore();
    // A faint smoke wisp marks the wreck site.
    ctx.fillStyle = 'rgba(150,150,150,0.4)';
    ctx.beginPath();
    ctx.arc(d.x + r * 0.3, d.y - r * 1.2, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintGulls(ctx, world) {
  ctx.strokeStyle = 'rgba(230,235,240,0.85)';
  ctx.lineWidth = 2;
  for (const g of world.gulls) {
    const flap = Math.sin(g.phase) * 5;
    ctx.beginPath();
    ctx.moveTo(g.x - 9, g.y - flap);
    ctx.quadraticCurveTo(g.x, g.y + 3, g.x + 9, g.y - flap);
    ctx.stroke();
  }
}

function paintParticles(ctx, world) {
  for (const p of world.particles) {
    const a = Math.max(0, p.life / p.maxLife);
    if (p.kind === 'text') {
      // Big, outlined popups on a dark backing plate: a "+25 CLOSE!"
      // must read over the pale beam as well as over dark sea.
      ctx.font = 'bold 23px Georgia, serif';
      ctx.textAlign = 'center';
      const w = ctx.measureText(p.text).width;
      ctx.fillStyle = `rgba(4,10,20,${a * 0.75})`;
      ctx.fillRect(p.x - w / 2 - 8, p.y - 20, w + 16, 28);
      ctx.lineWidth = 4;
      ctx.strokeStyle = `rgba(4,10,20,${a * 0.9})`;
      ctx.strokeText(p.text, p.x, p.y);
      ctx.fillStyle = p.text === 'WRECKED' ? `rgba(255,120,90,${a})` : `rgba(255,240,170,${a})`;
      ctx.fillText(p.text, p.x, p.y);
    } else if (p.kind === 'wreck') {
      ctx.fillStyle = `rgba(200,90,60,${a})`;
      ctx.fillRect(p.x - 2, p.y - 2, 5, 5);
    } else if (p.kind === 'flare') {
      ctx.fillStyle = `rgba(255,240,170,${a})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = `rgba(220,240,255,${a * 0.8})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2); ctx.fill();
    }
  }
}

// Rain: diagonal streaks, only when the night has rain. Night 5 is a storm.
function paintRain(ctx, world) {
  if (world.rain <= 0.02 || world.state === 'title' || world.state === 'dawn') return;
  const n = Math.floor(110 * world.rain);
  ctx.strokeStyle = `rgba(190,215,235,${0.3 * world.rain + 0.08})`;
  ctx.lineWidth = 1.5;
  for (let i = 0; i < n; i++) {
    const x = (i * 97 + 31) % (VIEW.w + 80);
    const y = (i * 173 + world.time * 430) % (VIEW.h - HORIZON_Y) + HORIZON_Y;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 9, y + 16);
    ctx.stroke();
  }
}

// The current, made visible: foam chevrons drifting with the flow, so the
// player can see which way an unlit boat will wander.
function paintCurrent(ctx, world) {
  if (world.state !== 'play' || world.current <= 0) return;
  ctx.strokeStyle = 'rgba(200,230,250,0.3)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    const x = 330 + i * 170;
    const y = HORIZON_Y + 40 + ((world.time * 14 + i * 67) % 280);
    ctx.beginPath();
    ctx.moveTo(x - 8, y);
    ctx.lineTo(x, y + 8);
    ctx.lineTo(x + 8, y);
    ctx.stroke();
  }
}

// Fog is a background layer only: it never covers the HUD.
function paintFog(ctx, world) {
  if (world.fog <= 0.02 || world.state === 'title') return;
  const g = ctx.createLinearGradient(0, HORIZON_Y, 0, VIEW.h);
  g.addColorStop(0, `rgba(160,180,200,${world.fog * 0.55})`);
  g.addColorStop(1, `rgba(160,180,200,${world.fog * 0.25})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, HORIZON_Y, VIEW.w, VIEW.h - HORIZON_Y);
  // Drifting fog banks.
  ctx.fillStyle = `rgba(190,205,220,${world.fog * 0.35})`;
  for (let i = 0; i < 3; i++) {
    const fx = ((world.time * 12 * (i + 1)) % (VIEW.w + 500)) - 250;
    ctx.beginPath();
    ctx.ellipse(fx + i * 420, 200 + i * 70, 190, 26, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintGustWarn(ctx, world) {
  const dir = world.gustWarn.dir;
  ctx.fillStyle = 'rgba(255,240,170,0.9)';
  ctx.font = 'bold 15px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText(dir > 0 ? 'GUST COMING — DOWN ▼' : 'GUST COMING — UP ▲', VIEW.w / 2, HORIZON_Y + 26);
}

// --- HUD & screens -----------------------------------------------------------

function paintHUD(ctx, world, ui) {
  // Top bar.
  ctx.fillStyle = 'rgba(6,16,30,0.72)';
  ctx.fillRect(0, 0, VIEW.w, 44);
  ctx.fillStyle = '#ffe9a8';
  ctx.font = 'bold 20px Georgia, serif';
  ctx.textAlign = 'left';
  ctx.fillText(`NIGHT ${world.night}/${NIGHT_COUNT}`, 16, 29);
  ctx.fillStyle = '#eaf4ff';
  ctx.font = '17px Georgia, serif';
  const out = NIGHTS[world.night - 1].boats;
  ctx.fillText(`BOATS ${world.savedThisNight}/${out}`, 170, 28);
  // Wreck hull icons (3 max).
  for (let i = 0; i < MAX_WRECKS; i++) {
    const x = 320 + i * 30;
    ctx.fillStyle = i < world.wrecks ? '#c0392b' : 'rgba(234,244,255,0.35)';
    ctx.beginPath();
    ctx.moveTo(x, 18); ctx.lineTo(x + 20, 18); ctx.lineTo(x + 16, 30); ctx.lineTo(x + 4, 30);
    ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = '#eaf4ff';
  ctx.fillText(`FLARES ${world.flares}  (SPACE)`, 430, 28);
  ctx.fillStyle = '#ffe9a8';
  ctx.font = 'bold 22px Georgia, serif';
  ctx.fillText(`SCORE ${world.score}`, 640, 29);
  ctx.fillStyle = '#9fb8cc';
  ctx.font = '15px Georgia, serif';
  ctx.fillText(`BEST ${world.best}`, 810, 28);
  // Focus mode + pause/mute buttons.
  ctx.fillStyle = world.focus ? '#ffe9a8' : '#9fb8cc';
  ctx.font = '15px Georgia, serif';
  ctx.fillText(world.focus ? 'BEAM: NARROW (F)' : 'BEAM: WIDE (F)', 920, 28);
  ctx.fillStyle = 'rgba(234,244,255,0.15)';
  ctx.fillRect(1120, 8, 60, 28);
  ctx.fillRect(1190, 8, 60, 28);
  ctx.fillStyle = '#eaf4ff';
  ctx.font = 'bold 15px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText(ui.paused ? '▶' : '❚❚', 1150, 28);
  ctx.fillText(ui.muted ? 'MUTE ✓' : 'SOUND', 1220, 28);
  ctx.textAlign = 'left';
}

function dimScreen(ctx, alpha) {
  ctx.fillStyle = `rgba(4,10,20,${alpha})`;
  ctx.fillRect(0, 0, VIEW.w, VIEW.h);
}

function paintTitle(ctx, world) {
  dimScreen(ctx, 0.45);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffe9a8';
  ctx.font = 'bold 84px Georgia, serif';
  ctx.fillText('TIDEKEEPER', VIEW.w / 2, 168);
  ctx.fillStyle = '#eaf4ff';
  ctx.font = '22px Georgia, serif';
  ctx.fillText('Guide the night boats home with your lighthouse beam.', VIEW.w / 2, 208);
  ctx.font = '19px Georgia, serif';
  ctx.fillText('Boats sail only in the light  •  3 wrecks ends the night  •  Survive 5 nights to dawn', VIEW.w / 2, 242);
  ctx.fillStyle = '#9fb8cc';
  ctx.font = '17px Georgia, serif';
  ctx.fillText('Mouse aim  •  SPACE flare  •  F focus beam  •  P pause  •  R restart', VIEW.w / 2, 276);
  if (world.best > 0) {
    ctx.fillStyle = '#ffe9a8';
    ctx.font = 'bold 20px Georgia, serif';
    ctx.fillText(`BEST SCORE ${world.best}`, VIEW.w / 2, 316);
  }
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 24px Georgia, serif';
  ctx.fillText('CLICK or press ENTER to start', VIEW.w / 2, 356);
  ctx.textAlign = 'left';
}

function paintBanner(ctx, world) {
  dimScreen(ctx, 0.25);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffe9a8';
  ctx.font = 'bold 44px Georgia, serif';
  ctx.fillText(world.message, VIEW.w / 2, 220);
  ctx.fillStyle = '#eaf4ff';
  ctx.font = '20px Georgia, serif';
  ctx.fillText(world.night >= NIGHT_COUNT ? 'Dawn is coming…' : `Night ${world.night + 1} approaches — ready your beam`, VIEW.w / 2, 258);
  ctx.textAlign = 'left';
}

function paintDawn(ctx, world) {
  dimScreen(ctx, 0.28);
  // The docked boats are the payoff: re-paint them above the dim so
  // their hulls and lanterns read instead of sinking into the murk.
  for (const d of world.docked) paintMooredBoat(ctx, d);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffe9a8';
  ctx.font = 'bold 64px Georgia, serif';
  ctx.fillText('DAWN BREAKS', VIEW.w / 2, 170);
  ctx.fillStyle = '#ffffff';
  ctx.font = '24px Georgia, serif';
  // Honest headline: only claim "every boat is home" when no boat wrecked.
  ctx.fillText(
    world.wrecks === 0
      ? `Every boat is home. All ${world.savedTotal} boats saved across 5 nights.`
      : `Dawn breaks over a battered fleet. ${world.savedTotal} boats saved across 5 nights.`,
    VIEW.w / 2, 214,
  );
  ctx.fillStyle = '#ffe9a8';
  ctx.font = 'bold 30px Georgia, serif';
  ctx.fillText(`FINAL SCORE ${world.score}`, VIEW.w / 2, 262);
  ctx.fillStyle = '#eaf4ff';
  ctx.font = '19px Georgia, serif';
  ctx.fillText(`Best ${world.best}   •   Wrecks ${world.wrecks}`, VIEW.w / 2, 296);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px Georgia, serif';
  ctx.fillText('Press R to play again', VIEW.w / 2, 336);
  ctx.textAlign = 'left';
}

function paintWreck(ctx, world) {
  dimScreen(ctx, 0.42);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff9a7a';
  ctx.font = 'bold 56px Georgia, serif';
  ctx.fillText('THE ROCKS CLAIM THREE', VIEW.w / 2, 170);
  ctx.fillStyle = '#eaf4ff';
  ctx.font = '22px Georgia, serif';
  ctx.fillText(`Night ${world.night} — ${world.savedTotal} boats saved, score ${world.score}.`, VIEW.w / 2, 214);
  ctx.fillStyle = '#ffe9a8';
  ctx.font = '19px Georgia, serif';
  ctx.fillText(`Best ${world.best}`, VIEW.w / 2, 248);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px Georgia, serif';
  ctx.fillText('Press R to try again', VIEW.w / 2, 288);
  ctx.textAlign = 'left';
}

function paintPaused(ctx) {
  dimScreen(ctx, 0.45);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 48px Georgia, serif';
  ctx.fillText('PAUSED', VIEW.w / 2, 230);
  ctx.font = '20px Georgia, serif';
  ctx.fillText('P to resume  •  R to restart', VIEW.w / 2, 268);
  ctx.textAlign = 'left';
}
