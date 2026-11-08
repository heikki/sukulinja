// Where an arrow key moves the Selected box, by the cards on screen alone:
// ↑ and ↓ to the nearest card on the next row up or down, ←/→ along the
// row. A move with nowhere to go is null.

import type { Box } from './emit';

export type Step = 'up' | 'down' | 'left' | 'right';

// Two boxes this close in a coordinate are level in it.
const LEVEL_PX = 0.5;

export function stepFrom(boxes: Box[], from: string, step: Step) {
  const at = boxes.find((b) => b.key === from);
  if (at === undefined) return null;
  if (step === 'left' || step === 'right') {
    return alongRow(boxes, at, step === 'left' ? -1 : 1);
  }
  const dir = step === 'up' ? -1 : 1;
  const beyond = boxes.filter((b) => (b.pos.y - at.pos.y) * dir > LEVEL_PX);
  if (beyond.length === 0) return null;
  const gap = Math.min(...beyond.map((b) => (b.pos.y - at.pos.y) * dir));
  const nextY = at.pos.y + gap * dir;
  return nearest(
    beyond.filter((b) => Math.abs(b.pos.y - nextY) <= LEVEL_PX),
    at.pos.x
  );
}

// Horizontally nearest to `x`; a tie goes to the left box, so one centred
// under a couple goes to the husband.
function nearest(boxes: Box[], x: number) {
  let best: Box | null = null;
  for (const b of boxes) {
    if (best === null) {
      best = b;
      continue;
    }
    const d = Math.abs(b.pos.x - x) - Math.abs(best.pos.x - x);
    if (d < -LEVEL_PX || (d <= LEVEL_PX && b.pos.x < best.pos.x)) best = b;
  }
  return best;
}

// The next box on `at`'s row, `dir` of it in drawn order; rows don't wrap.
function alongRow(boxes: Box[], at: Box, dir: -1 | 1) {
  const row = boxes
    .filter((b) => Math.abs(b.pos.y - at.pos.y) <= LEVEL_PX)
    .sort((a, b) => a.pos.x - b.pos.x);
  return row[row.indexOf(at) + dir] ?? null;
}
