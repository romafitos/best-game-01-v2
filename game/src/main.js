// TIDEKEEPER v2 — boot and the one loop: input is polled every frame,
// the world advances in fixed 1/60 s steps (several in a slow frame, none
// in a fast one), and the renderer paints what is there. The game moves
// between title, play, night-clear, dawn and wreck; P pauses, R restarts,
// M mutes, SPACE fires a flare, F focuses the beam.
//
// ?seed=N fixes the dealt sea. ?shot=play|title|storm|dawn (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.

import { VIEW } from './config.js';
import { createWorld, startNight, stepWorld } from './world.js';
import { paint } from './render.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

const STEP = 1 / 60;
/** The longest frame the loop catches up on; a longer stall is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const ctx = canvas.getContext('2d');

// OS motion preference (plan 004): reduced motion drops shake/flash and
// settles screen transitions at once. Headless Chromium reports
// no-preference, so screenshots are unaffected.
function applyMotionPrefs(world) {
  try {
    if (typeof window.matchMedia === 'function') {
      world.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
  } catch (e) { /* motion prefs are cosmetic, never fatal */ }
}

function announce(message) {
  status.textContent = message;
}

function runShot(name) {
  const world = stageShot(name, seed);
  applyMotionPrefs(world);
  const ui = { paused: false, muted: false };
  let painted = 0;
  function paintFrame() {
    paint(ctx, world, ui);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paintFrame);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paintFrame);
}

function runGame() {
  let world = createWorld(seed);
  applyMotionPrefs(world);
  const input = createInput(canvas);
  const audio = createAudio();
  const ui = { paused: false, muted: false };
  let best = world.best;
  let accumulator = 0;
  let last = performance.now();
  let prevSaved = 0, prevWrecks = 0, prevNight = 1, prevState = world.state;

  function freshRun() {
    world = createWorld(Math.floor(Math.random() * 4294967296));
    applyMotionPrefs(world);
    prevSaved = 0; prevWrecks = 0; prevNight = 1; prevState = world.state;
    accumulator = 0;
  }

  function beginNightOne() {
    startNight(world, 1);
    audio.ensure();
    audio.foghorn();
    announce('Night 1. Guide the boats home with your beam.');
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const ctrl = input.poll();

    if (ctrl.mutePressed) {
      ui.muted = audio.toggleMute();
    }
    if (ctrl.restartPressed && world.state !== 'title') {
      freshRun();
      beginNightOne();
    } else if (ctrl.startPressed && (world.state === 'title' || world.state === 'dawn' || world.state === 'wreck')) {
      if (world.state !== 'title') freshRun();
      beginNightOne();
    }
    if (ctrl.pausePressed && world.state === 'play') {
      ui.paused = !ui.paused;
      announce(ui.paused ? 'Paused.' : 'Playing.');
    }

    if (!ui.paused) {
      const stepCtrl = world.state === 'play'
        ? { aimX: ctrl.aimX, aimY: ctrl.aimY, flarePressed: ctrl.flarePressed, focusPressed: ctrl.focusPressed }
        : {};
      const beforeFlare = world.flares;
      while (accumulator >= STEP) {
        stepWorld(world, STEP, stepCtrl);
        accumulator -= STEP;
        stepCtrl.flarePressed = false;
        stepCtrl.focusPressed = false;
      }
      // One-shot sounds, from what changed this frame.
      if (world.savedThisNight > prevSaved) audio.bell();
      if (world.wrecks > prevWrecks) audio.thud();
      if (world.flares < beforeFlare) audio.whoosh();
      if (world.night > prevNight && world.state === 'play') audio.foghorn();
      if (world.state !== prevState) {
        if (world.state === 'dawn') announce(`Dawn breaks. Final score ${world.score}.`);
        if (world.state === 'wreck') announce(`The rocks claim three. Score ${world.score}.`);
        if (world.state === 'nightclear') announce(`Night ${world.night} clear.`);
      }
      prevSaved = world.savedThisNight;
      prevWrecks = world.wrecks;
      prevNight = world.night;
      prevState = world.state;
      if (world.best > best) best = world.best;
    } else {
      accumulator = 0;
    }

    paint(ctx, world, ui);
  }

  // Leaving the tab pauses a running game rather than letting boats sail unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && world.state === 'play' && !ui.paused) {
      ui.paused = true;
      announce('Paused.');
    }
  });

  announce('Tidekeeper. Click or press Enter to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
