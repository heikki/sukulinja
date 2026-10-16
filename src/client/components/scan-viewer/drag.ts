import type { Point } from '@client/pan-zoom';

// The glide after a drag, as the chart's.
export const MOMENTUM = { tauMs: 250, minV: 0.02, minReleaseV: 0.3 };

// A pointer sample: when, and where.
export interface Sample {
  t: number;
  at: Point;
}

// Moves apply as deltas to the current view, so a refit or a zoom during
// the drag isn't undone by it.
export interface Drag {
  start: Point;
  last: Point;
  moved: boolean;
  // The last two pointer samples, for the release velocity.
  samples: Sample[];
}

// How fast the pointer was moving when let go, from its last two samples,
// in pixels per millisecond; null where they can't say.
export function releaseVelocity(samples: Sample[]) {
  const [prev, last] = samples;
  if (prev === undefined || last === undefined) return null;
  const dt = last.t - prev.t;
  if (dt <= 0) return null;
  return {
    x: (last.at.x - prev.at.x) / dt,
    y: (last.at.y - prev.at.y) / dt
  };
}
