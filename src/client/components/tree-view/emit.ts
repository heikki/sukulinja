// Emit pass — walks the layout tree once with an accumulated absolute
// offset and produces a flat ID-keyed output for rendering. PersonBlocks
// contribute boxes (PlacedPerson); FamilyBlocks contribute lines
// (DrawnLine). Anchor slots inside FBs participate in line geometry but
// don't appear in the layout tree, so they emit no PlacedPerson — the
// box belongs to the upstream PB that owns this FB.

import type { Block } from './block';
import { translatePoint } from './helpers';
import type { Point } from './helpers';

export interface PlacedPerson {
  personId: number;
  x: number;
  y: number;
}

export interface DrawnLine {
  key: string;
  from: Point;
  to: Point;
}

export interface EmitOutput {
  persons: PlacedPerson[];
  lines: DrawnLine[];
}

export function emitLayout(root: Block, startAbs: Point): EmitOutput {
  const persons: PlacedPerson[] = [];
  const lines: DrawnLine[] = [];
  walk(root, startAbs, persons, lines);
  return { persons, lines };
}

function walk(
  block: Block,
  abs: Point,
  persons: PlacedPerson[],
  lines: DrawnLine[]
) {
  const local = block.renderLocal();
  for (const box of local.boxes) {
    persons.push({
      personId: box.personId,
      x: abs.x + box.offset.x,
      y: abs.y + box.offset.y
    });
  }
  for (const line of local.lines) {
    lines.push({
      key: line.key,
      from: translatePoint(line.from, abs),
      to: translatePoint(line.to, abs)
    });
  }
  for (const child of block.children) {
    walk(child, translatePoint(child.offset, abs), persons, lines);
  }
}
