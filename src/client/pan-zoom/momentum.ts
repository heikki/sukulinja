// Momentum pan: exponential-decay velocity drives a RAF loop that calls
// onTick with the per-frame pan delta. Returns null if the release velocity
// is below the minimum (no flick → no glide); otherwise returns a handle
// the caller invokes to interrupt the animation (new drag, wheel, refocus).

export interface MomentumOptions {
  tauMs: number;
  minV: number;
  minReleaseV: number;
}

export interface MomentumHandle {
  cancel: () => void;
}

export interface MomentumHandlers {
  // Called per RAF with the pan delta for this frame.
  onTick: (dx: number, dy: number) => void;
  // Called when velocity decays below minV. NOT called on explicit cancel —
  // a new gesture is settling separately and will fire its own settle event.
  onEnd: () => void;
}

export function startMomentumPan(
  vx: number,
  vy: number,
  options: MomentumOptions,
  handlers: MomentumHandlers
): MomentumHandle | null {
  if (Math.hypot(vx, vy) < options.minReleaseV) return null;
  let raf: number | null = null;
  let lastT = performance.now();
  let velX = vx;
  let velY = vy;
  function step(now: number) {
    const dt = now - lastT;
    lastT = now;
    handlers.onTick(velX * dt, velY * dt);
    const decay = Math.exp(-dt / options.tauMs);
    velX *= decay;
    velY *= decay;
    if (Math.hypot(velX, velY) < options.minV) {
      raf = null;
      handlers.onEnd();
      return;
    }
    raf = requestAnimationFrame(step);
  }
  raf = requestAnimationFrame(step);
  return {
    cancel: () => {
      if (raf !== null) cancelAnimationFrame(raf);
      raf = null;
    }
  };
}
