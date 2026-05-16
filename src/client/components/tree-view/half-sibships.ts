// Step-fam slot: a step-parent box at y=-ROW_H plus the half-sibship of
// Focus at y=0, both pivoted at slot-local x=0 so one shift positions both.
//
// The slot is consumed as a row slot by `focus-row.ts` (packed alongside
// bloodline-sibling slots), so the step-parent's X is driven by the focus
// row pack — guaranteeing each half-sibling family reserves its own
// horizontal column. The Tie back to the bloodline parent is drawn by the
// caller once it knows both sides' absolute Xs.

import {
  bareBox,
  BOX_H,
  presentChildren,
  ROW_H,
  sibshipLayout,
  unionLayouts
} from './helpers';
import type { FamilyRow, LayoutIndices, SubLayout } from './helpers';

export function buildStepFamSlot(
  fam: FamilyRow,
  stepId: number,
  ix: LayoutIndices
): SubLayout {
  const parts: SubLayout[] = [bareBox(stepId, -ROW_H)];
  const kids = presentChildren(fam, ix);
  if (kids.length > 0) {
    const children = kids.map((cid) => ({ id: cid, sub: bareBox(cid, 0) }));
    const sub = sibshipLayout(
      children,
      0,
      `hsib-${fam.id}`,
      -ROW_H + BOX_H / 2
    );
    parts.push(sub);
  }
  return unionLayouts(parts);
}
