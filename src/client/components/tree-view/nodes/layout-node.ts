// LayoutNode is the abstract base for the layout tree. Concrete nodes are
// PersonNode (one person box) and FamilyNode (one Couple Tie + sibship).
// Each LayoutNode carries its own `offset` relative to its parent — set by
// the parent during construction. Extents bubble up the tree via the
// `extents` getter, which composes children's extents with `selfHalfWidth`.
// The tree is consumed by the emit pass (see build/emit.ts), which walks
// once and produces a flat ID-keyed EmitOutput for rendering.

import type { Extents } from '../helpers';
import type { LayoutOffset } from './types';

export abstract class LayoutNode {
  // Position relative to this node's parent. x is local pixels; rowOffset is
  // an integer row count (emit multiplies by ROW_PITCH). A FamilyNode sets
  // its owned PersonNodes' offsets from the slot's localX; a PersonNode sets
  // its FamilyNode children's offsets from their row position.
  offset: LayoutOffset = { x: 0, rowOffset: 0 };

  abstract readonly children: readonly LayoutNode[];

  // How far this node's own box reaches from its pivot.
  abstract readonly selfHalfWidth: number;

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

  // Call when children change post-construction; the cached extents would
  // otherwise reflect the old child set.
  protected invalidateExtents() {
    this.cachedExtents = null;
  }
}
