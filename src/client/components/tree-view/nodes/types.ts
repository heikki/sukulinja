// Types shared across the nodes/ subdir. Each lives here when it's
// referenced by more than one node file, so that no single node file has to
// re-export scaffolding for the others.

import type { PersonNode } from './person-node';

// Position-only slot for a person whose PersonNode lives in an upstream
// node. Carries the personId (for line keys) and the local x in this family's
// frame (for tie/sibship geometry).
export interface Anchor {
  personId: number;
  localX: number;
}

// Slot for a PersonNode owned by this family — placed as one of its children
// at the recorded local x.
export interface OwnedPersonSlot {
  node: PersonNode;
  localX: number;
}

export type AdultSlot = OwnedPersonSlot | Anchor | null;
export type KidSlot = OwnedPersonSlot | Anchor;

// Structural offset between layout-tree nodes. x is local pixels (horizontal
// units are still pixel-flavored until the column-pitch abstraction lands).
// rowOffset is an integer count of rows — emit multiplies by ROW_PITCH when
// resolving absolute coordinates.
export interface LayoutOffset {
  x: number;
  rowOffset: number;
}

// Semantic position of a FamilyNode's Couple Tie. Resolved to a y by emit.
//   centered          → primary marriages and the chart-root parent FN
//   nonprimary-left   → non-primary marriage fanning to the left side
//   nonprimary-right  → non-primary marriage fanning to the right side
export type TieKind = 'centered' | 'nonprimary-left' | 'nonprimary-right';

// Semantic position of the Child anchor (see CONTEXT.md). y is determined by
// kind; x is the local pivot to drop from.
//   tie-midpoint  → Couple Tie midpoint (primary / centered marriages)
//   box-bottom    → bottom edge of an adult's box (non-primary, lone parent)
export interface ChildAnchor {
  x: number;
  kind: 'tie-midpoint' | 'box-bottom';
}
