// DescendantUnitBlock — one descendant person + their spouse fan + recursive
// kids' subtrees, as a Block.
//
// Multi-spouse fans use the primary/non-primary rule:
//   - primary fam: spouse at fanDir * COUPLE_PITCH, Tie at row Y, sibship
//     hangs from Tie midpoint (anchorX = spouseX/2).
//   - non-primary fam: spouse further outward (clears prior fam's footprint),
//     Tie offset by DESCENDANT_NONPRIMARY_TIE_OFFSET to distinguish, sibship
//     hangs from spouse box bottom (anchorX = spouseX, anchorY = BOX_H/2).
//
// Spouses are placed at every depth, but recursion into kids is gated by
// `depth < ix.levels` so the visible row-extent of the unit stays stable
// as the user re-focuses.

import { Block } from './block';
import type {
  LocalLine,
  LocalPersonBox,
  LocalPos,
  LocalRenderOutput,
  PlacedChild
} from './block';
import {
  BOX_H,
  BOX_W,
  COUPLE_GAP,
  COUPLE_PITCH,
  isHusbandIn,
  otherSpouseOf,
  presentChildren,
  ROW_H,
  SIBLING_GAP
} from './helpers';
import type { FamilyRow, LayoutIndices } from './helpers';

// Non-primary Tie Y offset, matching the legacy descendant.ts buildTie.
const DESCENDANT_NONPRIMARY_TIE_OFFSET = 6;

export interface KidPlacement {
  kidId: number;
  block: Block;
  // X relative to the DescendantUnitBlock's pivot (bloodline at x=0).
  offsetX: number;
}

export interface SpouseFamPlacement {
  famId: number;
  // Null if the other spouse isn't in ix (Tie still drawn into empty space,
  // matching legacy).
  spouseId: number | null;
  isPrimary: boolean;
  // All x's relative to bloodline; y's relative to bloodline row (y=0).
  spouseX: number;
  tieY: number;
  anchorX: number;
  anchorY: number;
  kidPlacements: KidPlacement[];
}

interface DescendantUnitExtents {
  leftWidth: number;
  rightWidth: number;
  rowLeftX: number;
  rowRightX: number;
}

export class DescendantUnitBlock extends Block {
  readonly leftWidth: number;
  readonly rightWidth: number;
  readonly children: readonly PlacedChild[];
  // Row-level extent (Y=row boxes only) — focus-row uses this to pack slots
  // without reserving the full subtree column.
  readonly rowLeftX: number;
  readonly rowRightX: number;

  constructor(
    readonly personId: number,
    readonly spouseFams: readonly SpouseFamPlacement[],
    extents: DescendantUnitExtents
  ) {
    super();
    this.leftWidth = extents.leftWidth;
    this.rightWidth = extents.rightWidth;
    this.rowLeftX = extents.rowLeftX;
    this.rowRightX = extents.rowRightX;
    const placed: PlacedChild[] = [];
    for (const fam of spouseFams) {
      for (const kid of fam.kidPlacements) {
        placed.push({
          block: kid.block,
          offsetX: kid.offsetX,
          offsetY: ROW_H
        });
      }
    }
    this.children = placed;
  }

  renderLocal(): LocalRenderOutput {
    const boxes: LocalPersonBox[] = [{ personId: this.personId, x: 0, y: 0 }];
    const lines: LocalLine[] = [];
    for (const fam of this.spouseFams) {
      if (fam.spouseId !== null) {
        boxes.push({ personId: fam.spouseId, x: fam.spouseX, y: 0 });
      }
      // Tie — always drawn, even when the spouse box isn't, matching legacy.
      const leftEnd = Math.min(0, fam.spouseX);
      const rightEnd = Math.max(0, fam.spouseX);
      lines.push({
        key: `tie-${fam.famId}`,
        x1: leftEnd + BOX_W / 2,
        y1: fam.tieY,
        x2: rightEnd - BOX_W / 2,
        y2: fam.tieY
      });
      if (fam.kidPlacements.length > 0) {
        appendDropBarLegs(lines, fam);
      }
    }
    return { boxes, lines };
  }

  personLocalPos(personId: number): LocalPos | null {
    if (personId === this.personId) return { x: 0, y: 0 };
    for (const fam of this.spouseFams) {
      if (fam.spouseId === personId) return { x: fam.spouseX, y: 0 };
      for (const k of fam.kidPlacements) {
        if (k.kidId === personId) return { x: k.offsetX, y: ROW_H };
        const inner = k.block.personLocalPos(personId);
        if (inner !== null) {
          return {
            x: k.offsetX + inner.x,
            y: ROW_H + inner.y
          };
        }
      }
    }
    return null;
  }
}

function appendDropBarLegs(lines: LocalLine[], fam: SpouseFamPlacement): void {
  const busY = ROW_H / 2;
  lines.push({
    key: `ddrop-${fam.famId}`,
    x1: fam.anchorX,
    y1: fam.anchorY,
    x2: fam.anchorX,
    y2: busY
  });
  const kidXs = fam.kidPlacements.map((k) => k.offsetX);
  if (kidXs.length > 1) {
    let minX = kidXs[0]!;
    let maxX = kidXs[0]!;
    for (const kx of kidXs) {
      if (kx < minX) minX = kx;
      if (kx > maxX) maxX = kx;
    }
    lines.push({
      key: `dsib-${fam.famId}-bar`,
      x1: minX,
      y1: busY,
      x2: maxX,
      y2: busY
    });
  }
  for (const k of fam.kidPlacements) {
    lines.push({
      key: `dsib-${fam.famId}-leg-${k.kidId}`,
      x1: k.offsetX,
      y1: busY,
      x2: k.offsetX,
      y2: ROW_H - BOX_H / 2
    });
  }
}

function descendantFanDir(
  personId: number,
  fams: FamilyRow[],
  ix: LayoutIndices
): 1 | -1 {
  if (fams.some((f) => isHusbandIn(f, personId))) return 1;
  if (ix.persons.get(personId)?.sex === 'M') return 1;
  return -1;
}

interface PackedKids {
  sibLeftWidth: number;
  sibRightWidth: number;
  offsetsFromBarMid: number[];
}

function packKids(kidBlocks: ReadonlyArray<{ block: Block }>): PackedKids {
  if (kidBlocks.length === 0) {
    return { sibLeftWidth: 0, sibRightWidth: 0, offsetsFromBarMid: [] };
  }
  const positions: number[] = [];
  let cursor = 0;
  for (const [k, kb] of kidBlocks.entries()) {
    if (k > 0) cursor += SIBLING_GAP;
    cursor += kb.block.leftWidth;
    positions.push(cursor);
    cursor += kb.block.rightWidth;
  }
  const totalWidth = cursor;
  const barMid = (positions[0]! + positions[positions.length - 1]!) / 2;
  return {
    sibLeftWidth: barMid,
    sibRightWidth: totalWidth - barMid,
    offsetsFromBarMid: positions.map((p) => p - barMid)
  };
}

interface SlotArgs {
  isPrimary: boolean;
  fanDir: 1 | -1;
  sibLeftWidth: number;
  sibRightWidth: number;
  outerEdge: number;
}

interface SlotResult {
  spouseX: number;
  anchorX: number;
  newOuterEdge: number;
}

function computeSpouseFamSlot(args: SlotArgs): SlotResult {
  const { isPrimary, fanDir, sibLeftWidth, sibRightWidth, outerEdge } = args;
  if (isPrimary) {
    const spouseX = fanDir * COUPLE_PITCH;
    const anchorX = spouseX / 2;
    const sibOuter = fanDir === 1 ? sibRightWidth : sibLeftWidth;
    const newOuterEdge = Math.max(
      Math.abs(spouseX) + BOX_W / 2,
      Math.abs(anchorX) + sibOuter
    );
    return { spouseX, anchorX, newOuterEdge };
  }
  const sibInner = fanDir === 1 ? sibLeftWidth : sibRightWidth;
  const sibOuter = fanDir === 1 ? sibRightWidth : sibLeftWidth;
  const inner = Math.max(BOX_W / 2, sibInner);
  const spouseDist = outerEdge + COUPLE_GAP + inner;
  const spouseX = fanDir * spouseDist;
  return {
    spouseX,
    anchorX: spouseX,
    newOuterEdge: spouseDist + Math.max(BOX_W / 2, sibOuter)
  };
}

interface FamPlacementContext {
  fam: FamilyRow;
  isPrimary: boolean;
  fanDir: 1 | -1;
  depth: number;
  includeChildren: boolean;
  outerEdge: number;
  ix: LayoutIndices;
  personId: number;
}

interface FamPlacementResult {
  placement: SpouseFamPlacement;
  newOuterEdge: number;
  rowOuterContribution: number;
  famLeftEdge: number;
  famRightEdge: number;
}

function placeOneSpouseFam(ctx: FamPlacementContext): FamPlacementResult {
  const {
    fam,
    isPrimary,
    fanDir,
    depth,
    includeChildren,
    outerEdge,
    ix,
    personId
  } = ctx;
  const otherId = otherSpouseOf(fam, personId);
  const renderedSpouseId =
    otherId !== null && ix.persons.has(otherId) ? otherId : null;

  const kidIds = includeChildren ? presentChildren(fam, ix) : [];
  const kidBlocks: Array<{ kidId: number; block: Block }> = kidIds.map(
    (cid) => ({
      kidId: cid,
      block: buildDescendantUnitBlock(cid, depth + 1, ix)
    })
  );
  const packed = packKids(kidBlocks);

  const slot = computeSpouseFamSlot({
    isPrimary,
    fanDir,
    sibLeftWidth: packed.sibLeftWidth,
    sibRightWidth: packed.sibRightWidth,
    outerEdge
  });

  const tieY = isPrimary ? 0 : -DESCENDANT_NONPRIMARY_TIE_OFFSET * fanDir;
  const anchorY = isPrimary ? 0 : BOX_H / 2;

  const kidPlacements: KidPlacement[] = kidBlocks.map((kb, k) => ({
    kidId: kb.kidId,
    block: kb.block,
    offsetX: slot.anchorX + packed.offsetsFromBarMid[k]!
  }));

  const placement: SpouseFamPlacement = {
    famId: fam.id,
    spouseId: renderedSpouseId,
    isPrimary,
    spouseX: slot.spouseX,
    tieY,
    anchorX: slot.anchorX,
    anchorY,
    kidPlacements
  };

  const rowOuterContribution =
    renderedSpouseId === null ? 0 : Math.abs(slot.spouseX) + BOX_W / 2;

  const famLeftEdge = Math.min(
    -BOX_W / 2,
    slot.spouseX - BOX_W / 2,
    slot.anchorX - packed.sibLeftWidth
  );
  const famRightEdge = Math.max(
    BOX_W / 2,
    slot.spouseX + BOX_W / 2,
    slot.anchorX + packed.sibRightWidth
  );

  return {
    placement,
    newOuterEdge: slot.newOuterEdge,
    rowOuterContribution,
    famLeftEdge,
    famRightEdge
  };
}

export function buildDescendantUnitBlock(
  personId: number,
  depth: number,
  ix: LayoutIndices
): DescendantUnitBlock {
  const fams = (ix.spouseFamsByPerson.get(personId) ?? []).filter(
    (f) => f.child_ids.length > 0 || otherSpouseOf(f, personId) !== null
  );
  if (fams.length === 0) {
    return new DescendantUnitBlock(personId, [], {
      leftWidth: BOX_W / 2,
      rightWidth: BOX_W / 2,
      rowLeftX: -BOX_W / 2,
      rowRightX: BOX_W / 2
    });
  }
  const fanDir = descendantFanDir(personId, fams, ix);
  const includeChildren = depth < ix.levels;
  // Iterate spouseFams in REVERSE so the most-recent marriage sits adjacent
  // to the shared person and the earliest fans furthest outward.
  const orderedFams = [...fams].reverse();

  const placements: SpouseFamPlacement[] = [];
  let outerEdge = BOX_W / 2;
  let rowOuterEdge = BOX_W / 2;
  let overallLeft = -BOX_W / 2;
  let overallRight = BOX_W / 2;

  for (const [i, fam] of orderedFams.entries()) {
    const result = placeOneSpouseFam({
      fam,
      isPrimary: i === 0,
      fanDir,
      depth,
      includeChildren,
      outerEdge,
      ix,
      personId
    });
    placements.push(result.placement);
    outerEdge = result.newOuterEdge;
    rowOuterEdge = Math.max(rowOuterEdge, result.rowOuterContribution);
    overallLeft = Math.min(overallLeft, result.famLeftEdge);
    overallRight = Math.max(overallRight, result.famRightEdge);
  }

  return new DescendantUnitBlock(personId, placements, {
    leftWidth: -overallLeft,
    rightWidth: overallRight,
    rowLeftX: fanDir === 1 ? -BOX_W / 2 : -rowOuterEdge,
    rowRightX: fanDir === 1 ? rowOuterEdge : BOX_W / 2
  });
}
