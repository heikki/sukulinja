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
//
// Width split:
//   - coupleLeftWidth / coupleRightWidth — own box + childhoodFamily only.
//     Used by an outer FamilyBlock that places this PB as an adult, so
//     Fa–Mo sep doesn't widen when Fa picks up step-fams (those land at
//     chart positions sized to clear the bloodline kid row separately).
//   - leftWidth / rightWidth — overall extent including marriages. Used
//     for outer packing and the chart's bounding box.

import { Block } from './block';
import type {
  LocalPersonBox,
  LocalPos,
  LocalRenderOutput,
  PlacedBlock
} from './block';
import type { FamilyBlock } from './block-family';
import { BOX_W, ROW_H } from './helpers';

export class PersonBlock extends Block {
  readonly leftWidth: number;
  readonly rightWidth: number;
  readonly coupleLeftWidth: number;
  readonly coupleRightWidth: number;
  readonly children: readonly PlacedBlock[];

  constructor(
    readonly personId: number,
    readonly childhoodFamily: FamilyBlock | null,
    readonly marriages: ReadonlyArray<FamilyBlock | null>,
    readonly activeMarriageIndex: number | null
  ) {
    super();
    let coupleLeft = BOX_W / 2;
    let coupleRight = BOX_W / 2;
    if (childhoodFamily !== null) {
      coupleLeft = Math.max(coupleLeft, childhoodFamily.leftWidth);
      coupleRight = Math.max(coupleRight, childhoodFamily.rightWidth);
    }
    this.coupleLeftWidth = coupleLeft;
    this.coupleRightWidth = coupleRight;

    let leftExt = coupleLeft;
    let rightExt = coupleRight;
    for (const m of marriages) {
      if (m === null) continue;
      leftExt = Math.max(leftExt, m.leftWidth);
      rightExt = Math.max(rightExt, m.rightWidth);
    }
    this.leftWidth = leftExt;
    this.rightWidth = rightExt;

    const placed: PlacedBlock[] = [];
    for (const m of marriages) {
      if (m === null) continue;
      placed.push({ block: m, offsetX: 0, offsetY: 0 });
    }
    if (childhoodFamily !== null) {
      placed.push({ block: childhoodFamily, offsetX: 0, offsetY: -ROW_H });
    }
    this.children = placed;
  }

  renderLocal(): LocalRenderOutput {
    const boxes: LocalPersonBox[] = [{ personId: this.personId, x: 0, y: 0 }];
    return { boxes, lines: [] };
  }

  personLocalPos(personId: number): LocalPos | null {
    if (personId === this.personId) return { x: 0, y: 0 };
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
