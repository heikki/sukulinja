// The render walk keeps edges flat at the top level so box-over-edge
// z-order is preserved without any per-Block bookkeeping.

import { translatePoint } from './helpers';
import type { Point } from './helpers';

export interface LocalPersonBox {
  personId: number;
  pos: Point;
}

export interface LocalLine {
  key: string;
  from: Point;
  to: Point;
}

export interface LocalRenderOutput {
  boxes: LocalPersonBox[];
  lines: LocalLine[];
}

export interface PlacedBlock {
  block: Block;
  offset: Point;
}

export abstract class Block {
  abstract readonly leftWidth: number;
  abstract readonly rightWidth: number;
  abstract readonly children: readonly PlacedBlock[];

  abstract renderLocal(): LocalRenderOutput;

  abstract personLocalPos(personId: number): Point | null;
}

export interface RenderGroup {
  offset: Point;
  boxes: LocalPersonBox[];
  childGroups: RenderGroup[];
}

export interface AbsoluteLine {
  key: string;
  from: Point;
  to: Point;
}

export interface RenderOutput {
  rootGroup: RenderGroup;
  lines: AbsoluteLine[];
}

export function renderChartBlocks(
  placedBlocks: readonly PlacedBlock[],
  extraLines: readonly AbsoluteLine[]
): RenderOutput {
  const childGroups: RenderGroup[] = [];
  const lines: AbsoluteLine[] = [...extraLines];
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

interface RenderOneResult {
  group: RenderGroup;
  lines: AbsoluteLine[];
}

function renderOneBlock(args: RenderOneArgs): RenderOneResult {
  const { block, offset, abs } = args;
  const local = block.renderLocal();
  const lines: AbsoluteLine[] = local.lines.map((l) => ({
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
