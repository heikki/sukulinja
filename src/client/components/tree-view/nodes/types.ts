// Types shared across the nodes/ subdir. Each lives here when it's
// referenced by more than one node file, so that no single node file has to
// re-export scaffolding for the others.

import type { Point } from '../helpers';
import type { PersonNode } from './person-node';

export interface Line {
  key: string;
  from: Point;
  to: Point;
}

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
