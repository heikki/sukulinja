// PersonNode — exactly one person. Recursion through the chart happens
// here: `childhoodFamily` (the Family this person is a child in) is placed
// above; each non-null entry in `marriages` (Families this person is a
// spouse in) is placed below.
//
// Marriages are stored in chronological order. `activeMarriageIndex` marks
// which one is rendered in "primary couple" style — the marriage adjacent
// to this person in the chart. A `null` entry at the active slot means
// the active marriage is owned by an outer FamilyNode (the bloodline-
// ancestor case: Fa.marriages has a null at the bloodline slot because
// the bloodline FamilyNode lives in the parent FamilyNode above). Roles:
//
//   - focus:    marriages = [...all, primary at the last slot], activeIdx = last
//   - sibling:  marriages = [primary],                          activeIdx = 0
//   - ancestor: marriages = [...stepFams, null at bloodline,...] (chronological),
//               activeIdx = bloodline position in spouseFams
//   - bare:     marriages = [], activeIdx = null

import { BOX_W, ROW_PITCH } from './helpers';
import { LayoutNode } from './node';
import type { FamilyNode } from './node-family';

export class PersonNode extends LayoutNode {
  readonly selfHalfWidth = BOX_W / 2;
  readonly children: readonly LayoutNode[];

  constructor(
    readonly personId: number,
    readonly childhoodFamily: FamilyNode | null,
    readonly marriages: ReadonlyArray<FamilyNode | null>,
    readonly activeMarriageIndex: number | null
  ) {
    super();
    const placed: LayoutNode[] = [];
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

  override personLocalPos(personId: number) {
    if (personId === this.personId) return { x: 0, y: 0 };
    return super.personLocalPos(personId);
  }
}
