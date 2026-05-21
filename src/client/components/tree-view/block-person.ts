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
import type { PersonBox } from './block';
import type { FamilyBlock } from './block-family';
import { BOX_W, ROW_PITCH } from './helpers';

export class PersonBlock extends Block {
  readonly selfHalfWidth = BOX_W / 2;
  readonly children: readonly Block[];

  constructor(
    readonly personId: number,
    readonly childhoodFamily: FamilyBlock | null,
    readonly marriages: ReadonlyArray<FamilyBlock | null>,
    readonly activeMarriageIndex: number | null
  ) {
    super();
    const placed: Block[] = [];
    for (const m of marriages) {
      if (m === null) continue;
      m.offset = { x: 0, y: 0 };
      placed.push(m);
    }
    const cf = childhoodFamily;
    if (cf !== null) {
      cf.offset = { x: 0, y: -ROW_PITCH };
      placed.push(cf);
    }
    this.children = placed;
  }

  renderLocal() {
    const boxes: PersonBox[] = [
      { personId: this.personId, offset: { x: 0, y: 0 } }
    ];
    return { boxes, lines: [] };
  }

  override personLocalPos(personId: number) {
    if (personId === this.personId) return { x: 0, y: 0 };
    return super.personLocalPos(personId);
  }
}
