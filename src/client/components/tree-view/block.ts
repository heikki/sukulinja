// The render walk keeps edges flat at the top level so box-over-edge
// z-order is preserved without any per-Block bookkeeping.

import { translatePoint } from './helpers';
import type { Extents, Point } from './helpers';

export interface PersonBox {
  personId: number;
  offset: Point;
}

export interface Line {
  key: string;
  from: Point;
  to: Point;
}

export interface LocalRenderOutput {
  boxes: PersonBox[];
  lines: Line[];
}

export interface PlacedBlock {
  block: Block;
  offset: Point;
}

export abstract class Block {
  abstract readonly children: readonly PlacedBlock[];

  // How far the block's own box reaches from its pivot (BOX_W/2 for
  // PersonBlock; 0 for FamilyBlock, which has no own box). Folded into the
  // extents calculation alongside children.
  abstract readonly selfHalfWidth: number;

  abstract renderLocal(): LocalRenderOutput;

  personLocalPos(personId: number): Point | null {
    for (const child of this.children) {
      const inner = child.block.personLocalPos(personId);
      if (inner !== null) return translatePoint(child.offset, inner);
    }
    return null;
  }

  private cachedExtents: Extents | null = null;
  get extents(): Extents {
    if (this.cachedExtents !== null) return this.cachedExtents;
    let left = this.selfHalfWidth;
    let right = this.selfHalfWidth;
    for (const c of this.children) {
      left = Math.max(left, c.block.extents.left - c.offset.x);
      right = Math.max(right, c.offset.x + c.block.extents.right);
    }
    this.cachedExtents = { left, right };
    return this.cachedExtents;
  }
}

export interface RenderGroup {
  offset: Point;
  boxes: PersonBox[];
  childGroups: RenderGroup[];
}

export interface RenderOutput {
  rootGroup: RenderGroup;
  lines: Line[];
}

export function renderChartBlocks(
  placedBlocks: readonly PlacedBlock[],
  extraLines: readonly Line[]
) {
  const childGroups: RenderGroup[] = [];
  const lines: Line[] = [...extraLines];
  for (const placed of placedBlocks) {
    const result = renderOneBlock({
      block: placed.block,
      offset: placed.offset,
      abs: placed.offset
    });
    childGroups.push(result.group);
    lines.push(...result.lines);
  }
  return {
    rootGroup: { offset: { x: 0, y: 0 }, boxes: [], childGroups },
    lines
  };
}

// `offset` is the group-local offset (written to group.offset so SVG
// transforms compose). `abs` is the accumulated chart-coord origin, used
// to translate lines into chart coords directly (lines are emitted flat at
// the top level — see file header).
interface RenderOneArgs {
  block: Block;
  offset: Point;
  abs: Point;
}

function renderOneBlock(args: RenderOneArgs) {
  const { block, offset, abs } = args;
  const local = block.renderLocal();
  const lines: Line[] = local.lines.map((l) => ({
    key: l.key,
    from: translatePoint(l.from, abs),
    to: translatePoint(l.to, abs)
  }));
  const childGroups: RenderGroup[] = [];
  for (const child of block.children) {
    const childResult = renderOneBlock({
      block: child.block,
      offset: child.offset,
      abs: translatePoint(child.offset, abs)
    });
    childGroups.push(childResult.group);
    lines.push(...childResult.lines);
  }
  return {
    group: { offset, boxes: local.boxes, childGroups },
    lines
  };
}
