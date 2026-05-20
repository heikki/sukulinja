// The depth-1 chart frame: where Fa and Mo sit (chart-X), and how far the
// bloodline footprint reaches left and right. Aunts/Uncles and Step-fam
// fans get placed past the outer edge on each side, so consumers ask the
// footprint for the relevant side rather than picking from a 4-tuple.

import type { PackedBlocks } from './build-marriages';
import { BOX_W, COUPLE_PITCH, isPersonKnown } from './helpers';
import type { FamilyRow, LayoutIndices } from './helpers';

export class BloodlineFootprint {
  constructor(
    readonly faChartX: number,
    readonly moChartX: number,
    readonly bloodlineLeftChart: number,
    readonly bloodlineRightChart: number
  ) {}

  parentChartX(side: 'left' | 'right') {
    return side === 'left' ? this.faChartX : this.moChartX;
  }

  outerEdge(side: 'left' | 'right') {
    return side === 'left' ? this.bloodlineLeftChart : this.bloodlineRightChart;
  }

  parentBoxEdge(side: 'left' | 'right') {
    const x = this.parentChartX(side);
    return side === 'left' ? x - BOX_W / 2 : x + BOX_W / 2;
  }
}

interface ComputeArgs {
  parentFam: FamilyRow;
  packed: PackedBlocks;
  sibIds: number[];
  focusId: number;
  ix: LayoutIndices;
}

// Footprint = union of focus's kid-row extent and Fa/Mo's own boxes at the
// parent row (NOT Aunts/Uncles, which get pushed past the footprint via
// the step-fam spacer).
export function computeBloodlineFootprint(args: ComputeArgs) {
  const sep = computeParentSep(args.parentFam, args.ix);
  const focusIdx = args.sibIds.indexOf(args.focusId);
  const focusLocalX = args.packed.positions[focusIdx]! - args.packed.barMid;
  const parentOffsetX = -focusLocalX;
  const faChartX = parentOffsetX + (sep > 0 ? -sep / 2 : 0);
  const moChartX = parentOffsetX + (sep > 0 ? sep / 2 : 0);
  const kidRowLeft = parentOffsetX - args.packed.barMid;
  const kidRowRight =
    parentOffsetX + (args.packed.totalWidth - args.packed.barMid);
  const parentRowLeft =
    args.parentFam.husband_id === null ? Infinity : faChartX - BOX_W / 2;
  const parentRowRight =
    args.parentFam.wife_id === null ? -Infinity : moChartX + BOX_W / 2;
  return new BloodlineFootprint(
    faChartX,
    moChartX,
    Math.min(kidRowLeft, parentRowLeft),
    Math.max(kidRowRight, parentRowRight)
  );
}

function computeParentSep(parentFam: FamilyRow, ix: LayoutIndices) {
  const faPresent = isPersonKnown(parentFam.husband_id, ix);
  const moPresent = isPersonKnown(parentFam.wife_id, ix);
  return faPresent && moPresent ? COUPLE_PITCH : 0;
}
