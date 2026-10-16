// Where the chart should keep Focus in view, from its boxes.

import type { Box, Extents } from './emit';
import { dims } from './renderer';
import type { Comfort } from './viewport';

function boundsOf(boxes: Box[]): Extents {
  const xs = boxes.map((b) => b.pos.x);
  const ys = boxes.map((b) => b.pos.y);
  return {
    min: {
      x: Math.min(...xs) - dims.boxW / 2,
      y: Math.min(...ys) - dims.boxH / 2
    },
    max: {
      x: Math.max(...xs) + dims.boxW / 2,
      y: Math.max(...ys) + dims.boxH / 2
    }
  };
}

// Comfort region: the Focus row plus the Parent row (or Focus's row alone), from
// the chart's boxes. Its cores, most preferred first: Focus and their spouses
// with every descendant below, then Focus and their spouses alone. Focus sits
// at chart y = 0.
export function comfortOf(
  boxes: Box[],
  coreIds: ReadonlySet<number>
): Comfort | null {
  const rowPitch = dims.boxH + dims.gapY;
  const rows = boxes.filter((b) => b.pos.y <= 0 && b.pos.y >= -rowPitch);
  if (rows.length === 0) return null;
  const region = boundsOf(rows);
  const couple = rows.filter((b) => b.pos.y === 0 && coreIds.has(b.personId));
  if (couple.length === 0) return { region, cores: [region] };
  const family = [...couple, ...boxes.filter((b) => b.pos.y > 0)];
  return { region, cores: [boundsOf(family), boundsOf(couple)] };
}
