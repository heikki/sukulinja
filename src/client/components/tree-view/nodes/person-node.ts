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
//
// `childhoodFamily` is settable: built bottom-up (e.g. focus-person builds
// the focus PersonNode without childhood so the parent-row builder can read
// its downward extents, then plugs the parent FN in via the setter).

import type { FamilyNode } from './family-node';
import { LayoutNode } from './layout-node';

export class PersonNode extends LayoutNode {
  readonly selfHalfWidth = 0.5;

  private _childhoodFamily: FamilyNode | null = null;

  constructor(
    readonly personId: number,
    childhoodFamily: FamilyNode | null,
    readonly marriages: ReadonlyArray<FamilyNode | null>,
    readonly activeMarriageIndex: number | null
  ) {
    super();
    if (childhoodFamily !== null) {
      this.childhoodFamily = childhoodFamily;
    }
  }

  get childhoodFamily(): FamilyNode | null {
    return this._childhoodFamily;
  }

  set childhoodFamily(fn: FamilyNode | null) {
    const next = fn;
    if (next !== null) {
      next.offset = { x: 0, rowOffset: -1 };
    }
    this._childhoodFamily = next;
    this.invalidateExtents();
  }

  get children(): readonly LayoutNode[] {
    const out: LayoutNode[] = [];
    for (const m of this.marriages) {
      if (m !== null) out.push(m);
    }
    if (this._childhoodFamily !== null) out.push(this._childhoodFamily);
    return out;
  }
}
