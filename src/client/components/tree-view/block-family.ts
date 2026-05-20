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
import type {
  LocalLine,
  LocalPos,
  LocalRenderOutput,
  PlacedChild
} from './block';
import { BOX_H, BOX_W, ROW_H } from './helpers';

export interface AdultPlacement {
  id: number;
  external: boolean;
  // Local X in this FB's frame.
  x: number;
  // null exactly when external === true.
  block: Block | null;
}

export interface KidPlacement {
  id: number;
  external: boolean;
  x: number;
  block: Block | null;
}

export interface FamilyBlockSpec {
  famId: number;
  husband: AdultPlacement | null;
  wife: AdultPlacement | null;
  kids: readonly KidPlacement[];
  // Local Y values.
  adultY: number;
  kidY: number;
  tieY: number;
  // Sibship drop origin in the local frame.
  childAnchorX: number;
  childAnchorY: number;
  // Extents in the local frame.
  leftWidth: number;
  rightWidth: number;
}

export class FamilyBlock extends Block {
  readonly leftWidth: number;
  readonly rightWidth: number;
  readonly children: readonly PlacedChild[];

  constructor(readonly spec: FamilyBlockSpec) {
    super();
    this.leftWidth = spec.leftWidth;
    this.rightWidth = spec.rightWidth;
    const placed: PlacedChild[] = [];
    if (spec.husband !== null && spec.husband.block !== null) {
      placed.push({
        block: spec.husband.block,
        offsetX: spec.husband.x,
        offsetY: spec.adultY
      });
    }
    if (spec.wife !== null && spec.wife.block !== null) {
      placed.push({
        block: spec.wife.block,
        offsetX: spec.wife.x,
        offsetY: spec.adultY
      });
    }
    for (const kid of spec.kids) {
      if (kid.block !== null) {
        placed.push({
          block: kid.block,
          offsetX: kid.x,
          offsetY: spec.kidY
        });
      }
    }
    this.children = placed;
  }

  renderLocal(): LocalRenderOutput {
    const lines: LocalLine[] = [];
    if (this.spec.husband !== null && this.spec.wife !== null) {
      // Husband-left convention can be violated by ancestor step-fams (the
      // step-spouse may sit on Fa's "wrong" side to match chronological
      // placement) — pick endpoints by X order, not by husband/wife roles.
      const leftX = Math.min(this.spec.husband.x, this.spec.wife.x);
      const rightX = Math.max(this.spec.husband.x, this.spec.wife.x);
      lines.push({
        key: `tie-${this.spec.famId}`,
        x1: leftX + BOX_W / 2,
        y1: this.spec.tieY,
        x2: rightX - BOX_W / 2,
        y2: this.spec.tieY
      });
    }
    if (this.spec.kids.length > 0) {
      this.appendSibshipLines(lines);
    }
    return { boxes: [], lines };
  }

  private appendSibshipLines(lines: LocalLine[]): void {
    const { spec } = this;
    const busY = spec.kidY - ROW_H / 2;
    let minKidX = spec.kids[0]!.x;
    let maxKidX = spec.kids[0]!.x;
    for (const k of spec.kids) {
      if (k.x < minKidX) minKidX = k.x;
      if (k.x > maxKidX) maxKidX = k.x;
    }
    // The drop lands at the bar's midpoint, not at the Tie's X. Under the
    // bloodline pyramid the Tie sits at chart-X = 2 * ancestorChartX
    // (CONTEXT.md "Bloodline pyramid", ADR-0001), which is generally not
    // above the sibship's bar midpoint — so a visible L-bend connects
    // them. For a single-kid sibship the bar collapses and the midpoint
    // is just that kid's column.
    const barMid = (minKidX + maxKidX) / 2;
    if (barMid === spec.childAnchorX) {
      lines.push({
        key: `sib-${spec.famId}-drop`,
        x1: spec.childAnchorX,
        y1: spec.childAnchorY,
        x2: spec.childAnchorX,
        y2: busY
      });
    } else {
      const elbowY = (spec.childAnchorY + busY) / 2;
      lines.push({
        key: `sib-${spec.famId}-drop-1`,
        x1: spec.childAnchorX,
        y1: spec.childAnchorY,
        x2: spec.childAnchorX,
        y2: elbowY
      });
      lines.push({
        key: `sib-${spec.famId}-drop-h`,
        x1: spec.childAnchorX,
        y1: elbowY,
        x2: barMid,
        y2: elbowY
      });
      lines.push({
        key: `sib-${spec.famId}-drop-2`,
        x1: barMid,
        y1: elbowY,
        x2: barMid,
        y2: busY
      });
    }
    if (maxKidX > minKidX) {
      lines.push({
        key: `sib-${spec.famId}-bar`,
        x1: minKidX,
        y1: busY,
        x2: maxKidX,
        y2: busY
      });
    }
    for (const k of spec.kids) {
      lines.push({
        key: `sib-${spec.famId}-leg-${k.id}`,
        x1: k.x,
        y1: busY,
        x2: k.x,
        y2: spec.kidY - BOX_H / 2
      });
    }
  }

  personLocalPos(personId: number): LocalPos | null {
    for (const child of this.children) {
      const inner = child.block.personLocalPos(personId);
      if (inner !== null) {
        return {
          x: child.offsetX + inner.x,
          y: child.offsetY + inner.y
        };
      }
    }
    return null;
  }
}
