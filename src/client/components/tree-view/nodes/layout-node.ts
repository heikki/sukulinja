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
  // Position relative to this node's parent, in slot units on both axes
  // (see LayoutOffset). FamilyNodes place owned PersonNodes at the slot's
  // localX with y = 0 (adults) or y = 1 (kids). PersonNodes place their
  // childhoodFamily at y = −1 and marriages at y = 0.
  offset: LayoutOffset = { x: 0, y: 0 };

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
