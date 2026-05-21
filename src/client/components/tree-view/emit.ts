// Emit pass — walks the layout tree once with an accumulated absolute
// offset and produces a flat ID-keyed output for rendering. PersonNodes
// contribute PlacedPerson records; FamilyNodes contribute Line records.
// Anchor slots inside a FamilyNode participate in line geometry but
// don't appear in the layout tree, so they emit no PlacedPerson — the
// box belongs to the upstream PersonNode that owns this FamilyNode.

import { translatePoint } from './helpers';
import type { Point } from './helpers';
import type { LayoutNode, Line } from './node';
import { FamilyNode } from './node-family';
import { PersonNode } from './node-person';

export interface PlacedPerson {
  personId: number;
  pos: Point;
}

export interface EmitOutput {
  persons: PlacedPerson[];
  lines: Line[];
}

export function emitLayout(root: LayoutNode, startAbs: Point): EmitOutput {
  const persons: PlacedPerson[] = [];
  const lines: Line[] = [];
  walk(root, startAbs, persons, lines);
  return { persons, lines };
}

function walk(
  node: LayoutNode,
  abs: Point,
  persons: PlacedPerson[],
  lines: Line[]
) {
  if (node instanceof PersonNode) {
    persons.push({ personId: node.personId, pos: { x: abs.x, y: abs.y } });
  } else if (node instanceof FamilyNode) {
    for (const line of node.lines()) {
      lines.push({
        key: line.key,
        from: translatePoint(line.from, abs),
        to: translatePoint(line.to, abs)
      });
    }
  }
  for (const child of node.children) {
    walk(child, translatePoint(child.offset, abs), persons, lines);
  }
}
