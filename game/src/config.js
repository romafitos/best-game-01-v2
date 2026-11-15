// TIDEKEEPER v2 — tuning: field geometry, boats, nights, scoring, weather.
// One job: every number the game balances on lives here, so a balance
// change touches this file and nothing else.

export const VIEW = { w: 1280, h: 480 };
export const HORIZON_Y = 112; // sky above this line, sea below it
export const LAMP = { x: 118, y: 196 }; // lighthouse lamp: the beam's origin
export const HARBOUR = { x: 1204, y: 330, dockTop: 296, dockBottom: 452 };
export const MAX_WRECKS = 3;
export const NIGHT_COUNT = 5;

// Beam modes. Wide is forgiving but short; narrow reaches far and demands
// a steady hand. F toggles between them mid-night.
export const BEAM = {
  wide: { halfAngle: 0.36, range: 1100, color: 'rgba(255, 236, 160, 0.55)' },
  narrow: { halfAngle: 0.13, range: 1250, color: 'rgba(255, 244, 190, 0.75)' },
};
export const FLARE_SECONDS = 3; // flare lights the rocks for this long
export const FLARE_LIT_SECONDS = 1.5; // ...and every boat for this long

// Boats, v2: hulls are 1.6-1.9x bigger than v1 so each type reads at a
// glance, even shrunk to the 768 px cover cell. Speeds and toughness are
// unchanged from the proven v1 balance.
export const BOAT_TYPES = {
  skiff: { r: 16, speed: 72, hits: 2, drift: 0.8, label: 'Skiff', lantern: '#fff3c4' },
  freighter: { r: 24, speed: 52, hits: 2, drift: 1.0, label: 'Freighter', lantern: '#ffd97a' },
  barge: { r: 28, speed: 38, hits: 2, drift: 1.4, label: 'Barge', lantern: '#b8f7c9' },
};

// Night escalation: boats, fog (0..1 overlay), current (px/s downward drift
// while a boat is unlit), gust events, gulls, flares granted, rain (0..1,
// visual only — it never changes the rules, only the mood and the read).
export const NIGHTS = [
  { boats: 3, fog: 0.08, current: 4, gusts: 0, gulls: 0, flares: 3, rain: 0 },
  { boats: 4, fog: 0.14, current: 6, gusts: 0, gulls: 1, flares: 3, rain: 0 },
  { boats: 6, fog: 0.20, current: 8, gusts: 1, gulls: 2, flares: 3, rain: 0.25 },
  { boats: 6, fog: 0.28, current: 10, gusts: 2, gulls: 2, flares: 4, rain: 0.55 },
  { boats: 8, fog: 0.36, current: 12, gusts: 3, gulls: 3, flares: 4, rain: 1 },
];

export const SCORING = {
  saved: 100, // per boat brought home
  nearMiss: 25, // per boat threading a rock inside one beam-width
  nightClear: 250, // per night cleared
  flareLeft: 50, // per unused flare at night clear
};

// Rocks: count per night, and the gap the generator must leave between two
// rock circles so a boat can always thread through.
export const ROCKS = { perNight: [3, 4, 5, 6, 7], minGap: 74, minR: 14, maxR: 30 };

// Gulls cross the sky and block the beam where they cut it.
export const GULL = { speed: 90, blockRadius: 30 };

// Gusts shove every boat sideways; a foam arrow telegraphs each one 2 s early.
export const GUST = { warnSeconds: 2, push: 46, duration: 1.2 };
