// FamilyBlock — one Couple Tie and one sibship (drop + bar + legs). Member
// boxes belong to PersonBlocks, not this block; anchor members (whose PB
// lives in an upstream block) appear in the spec as an `Anchor` carrying
// only the local x needed for line geometry.
//
// Pivot conventions, set by the spec, not the class:
//   - 2 owned adults: pivot at Tie midpoint
//   - 1 anchor adult + 1 owned adult: pivot at the anchor adult
//   - 1 owned adult (lone parent): pivot at that adult

import { Block } from './block';
import type { Line } from './block';
import type { PersonBlock } from './block-person';
import { BOX_H, BOX_W, ROW_PITCH } from './helpers';
import type { Point } from './helpers';

// Position-only slot for a person whose PersonBlock lives in an upstream
// block. Carries just the id (for line keys) and the local x in this FB's
// frame (for tie/sibship geometry).
export interface Anchor {
  id: number;
  localX: number;
}

// Slot for a PersonBlock owned by this FB — placed as one of its children
// at the recorded local x.
export interface OwnedPersonSlot {
  block: PersonBlock;
  localX: number;
}

export type AdultSlot = OwnedPersonSlot | Anchor | null;
export type KidSlot = OwnedPersonSlot | Anchor;

function isOwned(slot: OwnedPersonSlot | Anchor): slot is OwnedPersonSlot {
  return 'block' in slot;
}

function slotId(slot: OwnedPersonSlot | Anchor) {
  return isOwned(slot) ? slot.block.personId : slot.id;
}

export interface FamilyBlockSpec {
  famId: number;
  husband: AdultSlot;
  wife: AdultSlot;
  kids: readonly KidSlot[];
  // Couple-Tie Y in the local frame. Adults sit at y=0; kids at y=ROW_PITCH.
  tieY: number;
  // Sibship drop origin in the local frame.
  childAnchor: Point;
}

export class FamilyBlock extends Block {
  readonly selfHalfWidth = 0;
  readonly children: readonly Block[];

  constructor(readonly spec: FamilyBlockSpec) {
    super();
    const { husband, wife, kids } = spec;
    const placed: Block[] = [];
    if (husband !== null && isOwned(husband)) {
      husband.block.offset = { x: husband.localX, y: 0 };
      placed.push(husband.block);
    }
    if (wife !== null && isOwned(wife)) {
      wife.block.offset = { x: wife.localX, y: 0 };
      placed.push(wife.block);
    }
    for (const kid of kids) {
      if (isOwned(kid)) {
        kid.block.offset = { x: kid.localX, y: ROW_PITCH };
        placed.push(kid.block);
      }
    }
    this.children = placed;
  }

  renderLocal() {
    const lines: Line[] = [];
    if (this.spec.husband !== null && this.spec.wife !== null) {
      // Husband-left convention can be violated by ancestor step-fams (the
      // step-spouse may sit on Fa's "wrong" side to match chronological
      // placement) — pick endpoints by X order, not by husband/wife roles.
      const leftX = Math.min(this.spec.husband.localX, this.spec.wife.localX);
      const rightX = Math.max(this.spec.husband.localX, this.spec.wife.localX);
      lines.push({
        key: `tie-${this.spec.famId}`,
        from: { x: leftX + BOX_W / 2, y: this.spec.tieY },
        to: { x: rightX - BOX_W / 2, y: this.spec.tieY }
      });
    }
    if (this.spec.kids.length > 0) {
      this.appendSibshipLines(lines);
    }
    return { boxes: [], lines };
  }

  private appendSibshipLines(lines: Line[]) {
    const { spec } = this;
    const busY = ROW_PITCH / 2;
    // Drop is always vertical (see CONTEXT.md "Bloodline pyramid", ADR-0001).
    // The bar spans the union of childAnchor.x and the kid Xs — so a
    // one-kid sibship where the Tie sits off the kid's column (depth ≥ 2)
    // still connects via a horizontal bar from the drop to the kid's leg.
    lines.push({
      key: `sib-${spec.famId}-drop`,
      from: spec.childAnchor,
      to: { x: spec.childAnchor.x, y: busY }
    });
    let minX = spec.childAnchor.x;
    let maxX = spec.childAnchor.x;
    for (const k of spec.kids) {
      if (k.localX < minX) minX = k.localX;
      if (k.localX > maxX) maxX = k.localX;
    }
    if (maxX > minX) {
      lines.push({
        key: `sib-${spec.famId}-bar`,
        from: { x: minX, y: busY },
        to: { x: maxX, y: busY }
      });
    }
    for (const k of spec.kids) {
      lines.push({
        key: `sib-${spec.famId}-leg-${slotId(k)}`,
        from: { x: k.localX, y: busY },
        to: { x: k.localX, y: ROW_PITCH - BOX_H / 2 }
      });
    }
  }
}
