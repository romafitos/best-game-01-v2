// TIDEKEEPER v2 — input: mouse aim plus one-shot key presses.
// One job: turn browser events into a control packet the world steps with.
// Held state (the pointer) is read live; presses are edge-triggered and
// cleared by poll(), so a press between two frames is never lost and
// never counted twice.

export function createInput(canvas) {
  let aimX = 700, aimY = 300;
  let pressed = { flare: false, focus: false, pause: false, restart: false, start: false, mute: false };

  function canvasPoint(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  canvas.addEventListener('pointermove', (event) => {
    const p = canvasPoint(event.clientX, event.clientY);
    aimX = p.x; aimY = p.y;
  });
  canvas.addEventListener('pointerdown', (event) => {
    const p = canvasPoint(event.clientX, event.clientY);
    aimX = p.x; aimY = p.y;
    pressed.start = true;
  });
  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    switch (event.code) {
      case 'Space': pressed.flare = true; pressed.start = true; event.preventDefault(); break;
      case 'Enter': pressed.start = true; event.preventDefault(); break;
      case 'KeyF': pressed.focus = true; break;
      case 'KeyP': case 'Escape': pressed.pause = true; break;
      case 'KeyR': pressed.restart = true; break;
      case 'KeyM': pressed.mute = true; break;
      default: break;
    }
  });
  // A key released while the tab is hidden never sends keyup: clear the
  // one-shot queue on blur so a stale press cannot fire later.
  window.addEventListener('blur', () => {
    pressed = { flare: false, focus: false, pause: false, restart: false, start: false, mute: false };
  });

  return {
    // The control packet for one fixed step; one-shot flags clear on read.
    poll() {
      const packet = {
        aimX, aimY,
        flarePressed: pressed.flare,
        focusPressed: pressed.focus,
        pausePressed: pressed.pause,
        restartPressed: pressed.restart,
        startPressed: pressed.start,
        mutePressed: pressed.mute,
      };
      pressed = { flare: false, focus: false, pause: false, restart: false, start: false, mute: false };
      return packet;
    },
  };
}
