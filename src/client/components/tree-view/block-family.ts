// FamilyBlock — exactly one family (couple + their kids).
//
// The block owns:
//   - the Couple Tie (when both adults are present in the family)
//   - the sibship drop + bar + legs from the child anchor down to each kid
//
// The block does NOT draw boxes — every member's box belongs to its own
// PersonBlock. For non-external members the PersonBlock is a placed child of
// this FamilyBlock (so the box ends up at the right spot via the render
// walk). External members have a known local position by construction, used
// only for line geometry; their PersonBlock lives in some outer block.
//
// Pivot conventions (set by the builder, not the class):
//   - 2 internal adults: pivot at Tie midpoint
//   - 1 external adult + 1 internal adult: pivot at the external adult
//   - 1 internal adult (lone parent): pivot at that adult

import { Block } from './block';
import type { Line, PlacedBlock } from './block';
import { BOX_H, BOX_W, ROW_H, translatePoint } from './helpers';
import type { Point } from './helpers';

export interface PersonPlacement {
  id: number;
  external: boolean;
  // Local X in this FB's frame.
  x: number;
  // null exactly when external === true.
  block: Block | null;
}

export interface FamilyBlockSpec {
  famId: number;
  husband: PersonPlacement | null;
  wife: PersonPlacement | null;
  kids: readonly PersonPlacement[];
  // Local Y values.
  adultY: number;
  kidY: number;
  tieY: number;
  // Sibship drop origin in the local frame.
  childAnchor: Point;
}

export class FamilyBlock extends Block {
  readonly selfHalfWidth = 0;
  readonly children: readonly PlacedBlock[];

  constructor(readonly spec: FamilyBlockSpec) {
    super();
    const placed: PlacedBlock[] = [];
    if (spec.husband !== null && spec.husband.block !== null) {
      placed.push({
        block: spec.husband.block,
        offset: { x: spec.husband.x, y: spec.adultY }
      });
    }
    if (spec.wife !== null && spec.wife.block !== null) {
      placed.push({
        block: spec.wife.block,
        offset: { x: spec.wife.x, y: spec.adultY }
      });
    }
    for (const kid of spec.kids) {
      if (kid.block !== null) {
        placed.push({
          block: kid.block,
          offset: { x: kid.x, y: spec.kidY }
        });
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
      const leftX = Math.min(this.spec.husband.x, this.spec.wife.x);
      const rightX = Math.max(this.spec.husband.x, this.spec.wife.x);
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
    const busY = spec.kidY - ROW_H / 2;
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
      if (k.x < minX) minX = k.x;
      if (k.x > maxX) maxX = k.x;
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
        key: `sib-${spec.famId}-leg-${k.id}`,
        from: { x: k.x, y: busY },
        to: { x: k.x, y: spec.kidY - BOX_H / 2 }
      });
    }
  }

  personLocalPos(personId: number) {
    for (const child of this.children) {
      const inner = child.block.personLocalPos(personId);
      if (inner !== null) return translatePoint(child.offset, inner);
    }
    return null;
  }
}
