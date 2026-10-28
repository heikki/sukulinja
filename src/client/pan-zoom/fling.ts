// A pan let go. It coasts as momentum does, slowing exponentially, and
// eases out to rest at its bounds (bounds.ts) rather than passing them. Let
// go already past them, as a drag stretches, it springs back, critically
// damped so it comes back without wobbling; its speed outward is dropped,
// so it goes no further past them. Each axis goes its own way: a flick into
// the top edge stops there and still coasts sideways.

import type { MomentumOptions } from './momentum';
import type { Point } from './transform';

export interface FlingOptions extends MomentumOptions {
  // The spring's time constant: a bounce from the bound peaks this long
  // after it starts, and is back within about seven of them.
  springMs: number;
}

export interface FlingHandle {
  cancel: () => void;
}

interface FlingHandlers {
  // How far the content is past its bounds now (`overshoot`).
  over: () => Point;
  // Moves by a frame of springing back.
  onTick: (dx: number, dy: number) => void;
  // Moves by a frame of coasting, easing it to rest at the bounds; how far
  // it moved.
  coast: (dx: number, dy: number) => Point;
  // Called once both axes are at rest; not on cancel.
  onEnd: () => void;
}

// Closer than this to the bound is at it.
const REST_PX = 0.5;

// A spring back to the bound: from how far past it, at what speed, and how
// long ago.
interface Spring {
  from: number;
  v: number;
  t: number;
}

class AxisFling {
  resting = false;

  get coasting() {
    return this.spring === null && !this.resting;
  }

  // A coast of `asked` that the bounds let move only `moved`: stopped at
  // one, it rests there.
  coasted(asked: number, moved: number) {
    if (asked !== 0 && moved === 0) this.resting = true;
  }

  private spring: Spring | null = null;
  // The spring's distance past the bound as last moved to.
  private x = 0;

  constructor(
    // The coasting speed, px/ms.
    private v: number,
    private readonly options: FlingOptions
  ) {}

  // One frame of `dt` ms, starting `over` past the bound; how far it moves.
  step(dt: number, over: number) {
    if (this.resting) return 0;
    if (this.spring === null && Math.abs(over) > REST_PX) {
      const v = Math.sign(this.v) === Math.sign(over) ? 0 : this.v;
      this.spring = { from: over, v, t: 0 };
      this.x = over;
    }
    return this.spring === null ? this.coast(dt) : this.springStep(dt);
  }

  private coast(dt: number) {
    if (Math.abs(this.v) < this.options.minV) {
      this.resting = true;
      return 0;
    }
    const move = this.v * dt;
    this.v *= Math.exp(-dt / this.options.tauMs);
    return move;
  }

  private springStep(dt: number) {
    const s = this.spring!;
    s.t += dt;
    const w = 1 / this.options.springMs;
    const b = s.v + w * s.from;
    const decay = Math.exp(-w * s.t);
    const x = (s.from + b * s.t) * decay;
    const v = (s.v - w * b * s.t) * decay;
    const last = this.x;
    // Thrown back past the bound: inside, it coasts on.
    if (Math.sign(x) !== Math.sign(s.from)) {
      this.spring = null;
      this.v = v;
      this.x = 0;
      return x - last;
    }
    if (Math.abs(x) < REST_PX && Math.abs(v) < this.options.minV) {
      this.resting = true;
      this.x = 0;
      return -last;
    }
    this.x = x;
    return x - last;
  }
}

// A frame's moves, `d`: springing back as they are, coasting eased to the
// bounds. An axis whose coast the bounds stop comes to rest there.
function move(x: AxisFling, y: AxisFling, d: Point, handlers: FlingHandlers) {
  const coast = { x: x.coasting ? d.x : 0, y: y.coasting ? d.y : 0 };
  if (d.x !== coast.x || d.y !== coast.y) {
    handlers.onTick(d.x - coast.x, d.y - coast.y);
  }
  if (coast.x === 0 && coast.y === 0) return;
  const moved = handlers.coast(coast.x, coast.y);
  x.coasted(coast.x, moved.x);
  y.coasted(coast.y, moved.y);
}

// Null where there's nothing to do: let go too slowly to coast, and within
// bounds.
export function startFling(
  v: Point,
  options: FlingOptions,
  handlers: FlingHandlers
): FlingHandle | null {
  const over = handlers.over();
  const coasts = Math.hypot(v.x, v.y) >= options.minReleaseV;
  if (!coasts && Math.abs(over.x) <= REST_PX && Math.abs(over.y) <= REST_PX) {
    return null;
  }
  const x = new AxisFling(coasts ? v.x : 0, options);
  const y = new AxisFling(coasts ? v.y : 0, options);
  let raf: number | null = null;
  let lastT = performance.now();
  function step(now: number) {
    const dt = now - lastT;
    lastT = now;
    const at = handlers.over();
    move(x, y, { x: x.step(dt, at.x), y: y.step(dt, at.y) }, handlers);
    if (x.resting && y.resting) {
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
