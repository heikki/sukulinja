// Block is the abstract base for the layout tree. Concrete Blocks are
// PersonBlock (one person box) and FamilyBlock (one Couple Tie + sibship).
// Each Block carries its own `offset` relative to its parent — set by the
// parent during construction. The layout tree is consumed by the emit pass
// (see emit.ts), which produces a flat ID-keyed output for rendering.

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

export abstract class Block {
  // Position relative to this Block's parent. The parent sets it during
  // construction (FB sets its owned PBs' offsets from the slot's localX; PB
  // sets its FB children's offsets from their row position).
  offset: Point = { x: 0, y: 0 };

  abstract readonly children: readonly Block[];

  // How far the block's own box reaches from its pivot.
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
