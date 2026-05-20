// PersonBlock — exactly one person. Recursion through the chart happens
// here: `childhoodFamily` (the Family this person is a child in) is placed
// above; each non-null entry in `marriages` (Families this person is a
// spouse in) is placed below.
//
// Marriages are stored in chronological order. `activeMarriageIndex` marks
// which one is rendered in "primary couple" style — the marriage adjacent
// to this person in the chart. A `null` entry at the active slot means the
// active marriage is owned by an outer Block (the bloodline-ancestor case:
// Fa.marriages has a null at the bloodline slot because the bloodline FB
// lives in the parent FB above). Roles:
//
//   - focus PB:    marriages = [...all, primary at the last slot], activeIdx = last
//   - sibling PB:  marriages = [primary],                          activeIdx = 0
//   - ancestor PB: marriages = [...stepFams, null at bloodline,...] (chronological),
//                  activeIdx = bloodline position in spouseFams
//   - bare PB:     marriages = [], activeIdx = null

import { Block } from './block';
import type { LocalPersonBox, LocalRenderOutput, PlacedBlock } from './block';
import type { FamilyBlock } from './block-family';
import { BOX_W, ROW_H, translatePoint } from './helpers';
import type { Point } from './helpers';

export class PersonBlock extends Block {
  readonly leftWidth: number;
  readonly rightWidth: number;
  readonly children: readonly PlacedBlock[];

  constructor(
    readonly personId: number,
    readonly childhoodFamily: FamilyBlock | null,
    readonly marriages: ReadonlyArray<FamilyBlock | null>,
    readonly activeMarriageIndex: number | null
  ) {
    super();
    let left = BOX_W / 2;
    let right = BOX_W / 2;
    if (childhoodFamily !== null) {
      left = Math.max(left, childhoodFamily.leftWidth);
      right = Math.max(right, childhoodFamily.rightWidth);
    }
    for (const m of marriages) {
      if (m === null) continue;
      left = Math.max(left, m.leftWidth);
      right = Math.max(right, m.rightWidth);
    }
    this.leftWidth = left;
    this.rightWidth = right;

    const placed: PlacedBlock[] = [];
    for (const m of marriages) {
      if (m === null) continue;
      placed.push({ block: m, offset: { x: 0, y: 0 } });
    }
    if (childhoodFamily !== null) {
      placed.push({ block: childhoodFamily, offset: { x: 0, y: -ROW_H } });
    }
    this.children = placed;
  }

  renderLocal(): LocalRenderOutput {
    const boxes: LocalPersonBox[] = [
      { personId: this.personId, pos: { x: 0, y: 0 } }
    ];
    return { boxes, lines: [] };
  }

  personLocalPos(personId: number): Point | null {
    if (personId === this.personId) return { x: 0, y: 0 };
    for (const child of this.children) {
      const inner = child.block.personLocalPos(personId);
      if (inner !== null) return translatePoint(child.offset, inner);
    }
    return null;
  }
}
