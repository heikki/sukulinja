// A pan eased over a fixed time, as the details dock slides: bringing a
// selected card into view, in step with the dock opening beside it.

export function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3;
}

export function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export interface GlideHandle {
  cancel: () => void;
}

export interface GlideHandlers {
  // Called per frame with that frame's share of the pan.
  onTick: (dx: number, dy: number) => void;
  // Called once the whole pan has been made; not on cancel.
  onEnd: () => void;
}

export function startGlide(
  dx: number,
  dy: number,
  ms: number,
  handlers: GlideHandlers
): GlideHandle {
  let raf: number | null = null;
  const start = performance.now();
  let done = 0;
  function step(now: number) {
    const t = Math.min(1, (now - start) / ms);
    const at = easeOutCubic(t);
    handlers.onTick(dx * (at - done), dy * (at - done));
    done = at;
    if (t < 1) {
      raf = requestAnimationFrame(step);
      return;
    }
    raf = null;
    handlers.onEnd();
  }
  raf = requestAnimationFrame(step);
  return {
    cancel: () => {
      if (raf !== null) cancelAnimationFrame(raf);
      raf = null;
    }
  };
}
