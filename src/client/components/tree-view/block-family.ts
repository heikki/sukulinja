// FamilyBlock — Couple (or lone parent) + their sibship of children.
//
// Used for:
//   - Focus-row sibling slots: 2 adults (sibling + primary spouse) + 0 kids.
//   - Step-family slots: 1 adult (step-parent) + N half-siblings, with
//     externalSpouseRef pointing to the bloodline parent in another Block.
//   - General 2-adults-plus-kids family (parent row, descendant subtrees) —
//     not used in phase 4 but kept symmetric.
//
// Local frame convention: adults at y=0, kids at y=ROW_H (children below
// parents in screen coords). The Block is placed at the appropriate chart
// Y by the caller (e.g. focus-row places step-fam slots at chart Y=-ROW_H
// so the lone adult lands at the parent row).
//
// Pivot (local x=0):
//   - 2 adults: Tie midpoint.
//   - 1 adult: that adult's box X.
// Both coincide with the sibship bar midpoint when kids are present.

import { Block } from './block';
import type {
  CrossBlockConnector,
  ExternalSpouseRef,
  LocalLine,
  LocalPersonBox,
  LocalPos,
  LocalRenderOutput,
  PlacedChild
} from './block';
import { BOX_H, BOX_W, COUPLE_PITCH, ROW_H, SIBLING_GAP } from './helpers';

export type { ExternalSpouseRef } from './block';

export interface FamilyChildEntry {
  id: number;
  block: Block;
}

export interface FamilyBlockSpec {
  // The Family in the underlying data model (drives line keys).
  famId: number;
  // Adults: at least one must be non-null in practical use.
  husbandId: number | null;
  wifeId: number | null;
  // Children of this Family. Each entry has the child's id (for leg keys)
  // and the child's Block (PersonBlock for leaf, DescendantUnitBlock when
  // rendered with descendants).
  childEntries: readonly FamilyChildEntry[];
  // Step-family case: the missing adult is rendered in another FamilyBlock;
  // a cross-Block Tie connector will reach across at render time.
  externalSpouseRef: ExternalSpouseRef | null;
  // Prefix for the sibship bar / leg / drop line keys when kids are present
  // (e.g. 'hsib' → 'hsib-{famId}-bar'). Lets callers preserve the legacy
  // key format their context expects.
  sibKeyPrefix: string;
}

export class FamilyBlock extends Block {
  readonly leftWidth: number;
  readonly rightWidth: number;
  readonly children: readonly PlacedChild[];
  readonly husbandX: number | null;
  readonly wifeX: number | null;
  readonly anchorY: number;
  private readonly kidOffsets: number[];

  constructor(readonly spec: FamilyBlockSpec) {
    super();
    const adults = positionAdults(spec.husbandId, spec.wifeId);
    this.husbandX = adults.husbandX;
    this.wifeX = adults.wifeX;
    this.anchorY = adults.anchorY;

    const packed = packChildEntries(spec.childEntries);
    this.kidOffsets = packed.kidOffsets;
    this.children = packed.children;

    const extents = computeFamilyExtents(
      this.husbandX,
      this.wifeX,
      this.kidOffsets,
      spec.childEntries
    );
    this.leftWidth = extents.leftWidth;
    this.rightWidth = extents.rightWidth;
  }

  renderLocal(): LocalRenderOutput {
    const boxes: LocalPersonBox[] = [];
    if (this.husbandX !== null && this.spec.husbandId !== null) {
      boxes.push({ personId: this.spec.husbandId, x: this.husbandX, y: 0 });
    }
    if (this.wifeX !== null && this.spec.wifeId !== null) {
      boxes.push({ personId: this.spec.wifeId, x: this.wifeX, y: 0 });
    }
    const lines: LocalLine[] = [];
    if (this.husbandX !== null && this.wifeX !== null) {
      lines.push({
        key: `tie-${this.spec.famId}`,
        x1: this.husbandX + BOX_W / 2,
        y1: 0,
        x2: this.wifeX - BOX_W / 2,
        y2: 0
      });
    }
    if (this.spec.childEntries.length > 0) {
      this.appendSibshipLines(lines);
    }
    return { boxes, lines };
  }

  private appendSibshipLines(lines: LocalLine[]): void {
    const busY = ROW_H / 2;
    const prefix = `${this.spec.sibKeyPrefix}-${this.spec.famId}`;
    lines.push({
      key: `${prefix}-drop`,
      x1: 0,
      y1: this.anchorY,
      x2: 0,
      y2: busY
    });
    if (this.kidOffsets.length > 1) {
      let minX = this.kidOffsets[0]!;
      let maxX = this.kidOffsets[0]!;
      for (const k of this.kidOffsets) {
        if (k < minX) minX = k;
        if (k > maxX) maxX = k;
      }
      lines.push({
        key: `${prefix}-bar`,
        x1: minX,
        y1: busY,
        x2: maxX,
        y2: busY
      });
    }
    for (const [i, entry] of this.spec.childEntries.entries()) {
      lines.push({
        key: `${prefix}-leg-${entry.id}`,
        x1: this.kidOffsets[i]!,
        y1: busY,
        x2: this.kidOffsets[i]!,
        y2: ROW_H - BOX_H / 2
      });
    }
  }

  personLocalPos(personId: number): LocalPos | null {
    if (this.husbandX !== null && this.spec.husbandId === personId) {
      return { x: this.husbandX, y: 0 };
    }
    if (this.wifeX !== null && this.spec.wifeId === personId) {
      return { x: this.wifeX, y: 0 };
    }
    for (const placed of this.children) {
      const inner = placed.block.personLocalPos(personId);
      if (inner !== null) {
        return {
          x: placed.offsetX + inner.x,
          y: placed.offsetY + inner.y
        };
      }
    }
    return null;
  }

  override crossBlockConnectors(): readonly CrossBlockConnector[] {
    if (this.spec.externalSpouseRef === null) return [];
    const visibleParentId = this.spec.husbandId ?? this.spec.wifeId;
    if (visibleParentId === null) return [];
    return [
      {
        key: `tie-${this.spec.famId}`,
        fromPersonId: visibleParentId,
        toPersonId: this.spec.externalSpouseRef.personId,
        style: 'step-tie'
      }
    ];
  }
}

interface AdultPositions {
  husbandX: number | null;
  wifeX: number | null;
  anchorY: number;
}

function positionAdults(
  husbandId: number | null,
  wifeId: number | null
): AdultPositions {
  if (husbandId !== null && wifeId !== null) {
    return { husbandX: -COUPLE_PITCH / 2, wifeX: COUPLE_PITCH / 2, anchorY: 0 };
  }
  if (husbandId !== null) {
    return { husbandX: 0, wifeX: null, anchorY: BOX_H / 2 };
  }
  if (wifeId !== null) {
    return { husbandX: null, wifeX: 0, anchorY: BOX_H / 2 };
  }
  return { husbandX: null, wifeX: null, anchorY: 0 };
}

interface PackedChildren {
  kidOffsets: number[];
  children: readonly PlacedChild[];
}

function packChildEntries(
  childEntries: readonly FamilyChildEntry[]
): PackedChildren {
  if (childEntries.length === 0) {
    return { kidOffsets: [], children: [] };
  }
  const positions: number[] = [];
  let cursor = 0;
  for (const [i, entry] of childEntries.entries()) {
    if (i > 0) cursor += SIBLING_GAP;
    cursor += entry.block.leftWidth;
    positions.push(cursor);
    cursor += entry.block.rightWidth;
  }
  const barMid = (positions[0]! + positions[positions.length - 1]!) / 2;
  const kidOffsets = positions.map((p) => p - barMid);
  const children: PlacedChild[] = childEntries.map((entry, i) => ({
    block: entry.block,
    offsetX: kidOffsets[i]!,
    offsetY: ROW_H
  }));
  return { kidOffsets, children };
}

function computeFamilyExtents(
  husbandX: number | null,
  wifeX: number | null,
  kidOffsets: readonly number[],
  childEntries: readonly FamilyChildEntry[]
): { leftWidth: number; rightWidth: number } {
  let overallLeft = 0;
  let overallRight = 0;
  if (husbandX !== null) {
    overallLeft = Math.min(overallLeft, husbandX - BOX_W / 2);
    overallRight = Math.max(overallRight, husbandX + BOX_W / 2);
  }
  if (wifeX !== null) {
    overallLeft = Math.min(overallLeft, wifeX - BOX_W / 2);
    overallRight = Math.max(overallRight, wifeX + BOX_W / 2);
  }
  for (const [i, entry] of childEntries.entries()) {
    const offset = kidOffsets[i]!;
    overallLeft = Math.min(overallLeft, offset - entry.block.leftWidth);
    overallRight = Math.max(overallRight, offset + entry.block.rightWidth);
  }
  return { leftWidth: -overallLeft, rightWidth: overallRight };
}
