// Emit pass — walks the layout tree once with an accumulated absolute
// offset and produces a flat ID-keyed output for rendering. PersonNodes
// contribute Box records; FamilyNodes contribute Line records. Anchor
// slots inside a FamilyNode participate in line geometry but don't appear
// in the layout tree, so they emit no Box — the box belongs to the
// upstream PersonNode that owns this FamilyNode.

import { translatePoint } from '../helpers';
import type { Point } from '../helpers';
import { FamilyNode, PersonNode } from '../nodes';
import type { LayoutNode, Line } from '../nodes';

export interface Box {
  personId: number;
  pos: Point;
}

export interface EmitOutput {
  boxes: Box[];
  lines: Line[];
}

export function emitLayout(root: LayoutNode, startAbs: Point): EmitOutput {
  const boxes: Box[] = [];
  const lines: Line[] = [];
  walk(root, startAbs, boxes, lines);
  return { boxes, lines };
}

function walk(node: LayoutNode, abs: Point, boxes: Box[], lines: Line[]) {
  if (node instanceof PersonNode) {
    boxes.push({ personId: node.personId, pos: { x: abs.x, y: abs.y } });
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
    walk(child, translatePoint(child.offset, abs), boxes, lines);
  }
}
