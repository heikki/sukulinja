// Emit pass — walks the layout tree once with an accumulated absolute
// offset and produces a flat ID-keyed output for rendering. PersonNodes
// contribute Box records; FamilyNodes contribute Line records. Anchor
// slots inside a FamilyNode participate in line geometry but don't appear
// in the layout tree, so they emit no Box — the box belongs to the
// upstream PersonNode that owns this FamilyNode.
//
// Emit is also the seam where the layout's structural units resolve to
// absolute pixel coordinates, using the EmitTheme passed in by the caller.
// LayoutOffset is in slot units on both axes — sub-slot x (sibship
// packing), integer-generation y. Intra-family endpoints come in as
// pixels from familyLines via FamilyNode.tieKind and ChildAnchor.kind.

import type { Point } from '../helpers';
import { FamilyNode } from '../nodes/family-node';
import type { LayoutNode } from '../nodes/layout-node';
import { PersonNode } from '../nodes/person-node';

export interface EmitTheme {
  boxW: number;
  boxH: number;
  gapX: number;
  gapY: number;
  nonprimaryTieYOffset: number;
}

export interface Box {
  personId: number;
  pos: Point;
}

export interface Line {
  key: string;
  from: Point;
  to: Point;
}

export interface EmitOutput {
  boxes: Box[];
  lines: Line[];
}

export function emitLayout(
  root: LayoutNode,
  startAbs: Point,
  theme: EmitTheme
): EmitOutput {
  const slotPitch = theme.boxW + theme.gapX;
  const rowPitch = theme.boxH + theme.gapY;
  // Half-box-width in slot units; used for tie-endpoint clipping.
  const boxHalfSlot = theme.boxW / slotPitch / 2;
  const boxes: Box[] = [];
  const lines: Line[] = [];

  function walk(node: LayoutNode, abs: Point) {
    if (node instanceof PersonNode) {
      boxes.push({
        personId: node.personId,
        pos: { x: abs.x * slotPitch, y: abs.y }
      });
    } else if (node instanceof FamilyNode) {
      for (const line of familyLines(node)) {
        lines.push({
          key: line.key,
          from: {
            x: (line.from.x + abs.x) * slotPitch,
            y: line.from.y + abs.y
          },
          to: { x: (line.to.x + abs.x) * slotPitch, y: line.to.y + abs.y }
        });
      }
    }
    for (const child of node.children) {
      walk(child, {
        x: abs.x + child.offset.x,
        y: abs.y + child.offset.y * rowPitch
      });
    }
  }

  function familyLines(node: FamilyNode): Line[] {
    // Endpoints are in family-local coords (slot units for x, pixels for y).
    const out: Line[] = [];
    if (node.husband !== null && node.wife !== null) {
      // Husband-left convention can be violated by ancestor step-fams (the
      // step-spouse may sit on Fa's "wrong" side to match chronological
      // placement) — pick endpoints by X order, not by husband/wife roles.
      const leftX = Math.min(node.husband.localX, node.wife.localX);
      const rightX = Math.max(node.husband.localX, node.wife.localX);
      const ty =
        node.tieKind === 'centered'
          ? 0
          : node.tieKind === 'nonprimary-left'
            ? theme.nonprimaryTieYOffset
            : -theme.nonprimaryTieYOffset;
      out.push({
        key: `tie-${node.famId}`,
        from: { x: leftX + boxHalfSlot, y: ty },
        to: { x: rightX - boxHalfSlot, y: ty }
      });
    }
    if (node.kids.length > 0) {
      appendSibshipLines(node, out);
    }
    return out;
  }

  function appendSibshipLines(node: FamilyNode, out: Line[]) {
    const { famId, kids, childAnchor } = node;
    // Bus sits midway between this family's tie row and the kid row.
    const busY = rowPitch / 2;
    const anchorPoint: Point = {
      x: childAnchor.x,
      y: childAnchor.kind === 'tie-midpoint' ? 0 : theme.boxH / 2
    };
    // Drop is always vertical (see CONTEXT.md "Bloodline pyramid", ADR-0001).
    // The bar spans the union of childAnchor.x and the kid Xs — so a
    // one-kid sibship where the Tie sits off the kid's column (depth ≥ 2)
    // still connects via a horizontal bar from the drop to the kid's leg.
    out.push({
      key: `sib-${famId}-drop`,
      from: anchorPoint,
      to: { x: anchorPoint.x, y: busY }
    });
    let minX = anchorPoint.x;
    let maxX = anchorPoint.x;
    for (const k of kids) {
      if (k.localX < minX) minX = k.localX;
      if (k.localX > maxX) maxX = k.localX;
    }
    if (maxX > minX) {
      out.push({
        key: `sib-${famId}-bar`,
        from: { x: minX, y: busY },
        to: { x: maxX, y: busY }
      });
    }
    for (const k of kids) {
      const personId = 'node' in k ? k.node.personId : k.personId;
      out.push({
        key: `sib-${famId}-leg-${personId}`,
        from: { x: k.localX, y: busY },
        // Leg foot lands at the top of the kid's box: half a box down past
        // this family's tie row, then a full vertical gap.
        to: { x: k.localX, y: theme.boxH / 2 + theme.gapY }
      });
    }
  }

  walk(root, startAbs);
  return { boxes, lines };
}
