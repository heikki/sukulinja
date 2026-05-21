// LayoutNode is the abstract base for the layout tree. Concrete nodes are
// PersonNode (one person box) and FamilyNode (one Couple Tie + sibship).
// Each LayoutNode carries its own `offset` relative to its parent — set by
// the parent during construction. Extents bubble up the tree via the
// `extents` getter, which composes children's extents with `selfHalfWidth`.
// The tree is consumed by the emit pass (see emit.ts), which walks once
// and produces a flat ID-keyed EmitOutput for rendering.

import { translatePoint } from './helpers';
import type { Extents, Point } from './helpers';

export interface PersonBox {
  personId: number;
  offset: Point;
}

export interface Line {
  key: string;
  from: Point;
  to: Point;
}

export interface LocalRenderOutput {
  boxes: PersonBox[];
  lines: Line[];
}

export abstract class LayoutNode {
  // Position relative to this LayoutNode's parent. The parent sets it during
  // construction (FN sets its owned PNs' offsets from the slot's localX; PN
  // sets its FN children's offsets from their row position).
  offset: Point = { x: 0, y: 0 };

  abstract readonly children: readonly LayoutNode[];

  // How far this node's own box reaches from its pivot.
  abstract readonly selfHalfWidth: number;

  abstract renderLocal(): LocalRenderOutput;

  personLocalPos(personId: number): Point | null {
    for (const child of this.children) {
      const inner = child.personLocalPos(personId);
      if (inner !== null) return translatePoint(child.offset, inner);
    }
    return null;
  }

  private cachedExtents: Extents | null = null;
  get extents(): Extents {
    if (this.cachedExtents !== null) return this.cachedExtents;
    let left = this.selfHalfWidth;
    let right = this.selfHalfWidth;
    for (const c of this.children) {
      left = Math.max(left, c.extents.left - c.offset.x);
      right = Math.max(right, c.offset.x + c.extents.right);
    }
    this.cachedExtents = { left, right };
    return this.cachedExtents;
  }
}
