// TIDEKEEPER v2 — audio: procedural WebAudio only, no assets.
// One job: foghorns, bells, wave wash and flare whooshes from oscillators
// and filtered noise. Everything is guarded: if the browser has no audio,
// the game plays silent instead of crashing.

export function createAudio() {
  let ctx = null;
  let master = null;
  let wash = null;
  let muted = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      startWash();
      return true;
    } catch (e) { return false; }
  }

  function noiseBuffer(seconds) {
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  // Low wave wash loop: brown-ish noise through a slow low-pass wobble.
  function startWash() {
    try {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(3);
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 320;
      const gain = ctx.createGain();
      gain.gain.value = 0.05;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.12;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.025;
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start();
      lfo.start();
      wash = { src, lfo };
    } catch (e) { /* wash is ambience, never fatal */ }
  }

  function tone(freq, seconds, type, volume, slideTo) {
    if (!ctx || !master) return;
    try {
      const osc = ctx.createOscillator();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + seconds);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + seconds);
      osc.connect(gain);
      gain.connect(master);
      osc.start();
      osc.stop(ctx.currentTime + seconds);
    } catch (e) { /* a missed blip is never fatal */ }
  }

  return {
    ensure,
    get muted() { return muted; },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    // Night-start foghorn: two low tones a fifth apart, slow swell.
    foghorn() {
      if (!ensure()) return;
      tone(98, 1.6, 'sine', 0.22, 92);
      tone(147, 1.6, 'sine', 0.12, 138);
    },
    // One clear bell per boat saved.
    bell() {
      if (!ensure()) return;
      tone(880, 0.9, 'sine', 0.16);
      tone(1318, 0.6, 'sine', 0.06);
    },
    // Flare whoosh: a short burst of high-passed noise.
    whoosh() {
      if (!ensure() || !ctx) return;
      try {
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer(0.7);
        const filter = ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 900;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.7);
        src.connect(filter);
        filter.connect(gain);
        gain.connect(master);
        src.start();
      } catch (e) { /* never fatal */ }
    },
    // Wreck thud: a low thump plus a short noise crunch.
    thud() {
      if (!ensure()) return;
      tone(70, 0.5, 'sine', 0.3, 45);
    },
  };
}
