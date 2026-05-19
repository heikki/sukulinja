// Base Block class + shared types for the block-tree layout.
//
// Two concrete kinds (see docs/ancestor-refactor.html):
//   - PersonBlock — exactly one person; recursion happens here, via
//     `childhoodFamily` placed above and `marriages` placed below.
//   - FamilyBlock — exactly one family (couple + their kids); never recurses.
//
// Each Block has:
//   - a local coordinate frame (pivot at (0, 0))
//   - leftWidth/rightWidth — extent from the pivot
//   - children — other Blocks placed at offsets in this frame
//   - renderLocal() — own boxes + lines in own frame
//   - personLocalPos(id) — where a rendered person sits in own frame
//     (returns null for external members or unknown ids)
//
// The render walk converts boxes into nested <g transform> groups and keeps
// edges flat at the top level, so the box-over-edge z-order is preserved
// without any per-Block bookkeeping.

import type { Line } from './helpers';

export type { Line };

export interface LocalPersonBox {
  personId: number;
  x: number;
  y: number;
}

export interface LocalLine {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface LocalRenderOutput {
  boxes: LocalPersonBox[];
  lines: LocalLine[];
}

export interface LocalPos {
  x: number;
  y: number;
}

export interface PlacedChild {
  block: Block;
  offsetX: number;
  offsetY: number;
}

export abstract class Block {
  abstract readonly leftWidth: number;
  abstract readonly rightWidth: number;
  abstract readonly children: readonly PlacedChild[];

  abstract renderLocal(): LocalRenderOutput;

  abstract personLocalPos(personId: number): LocalPos | null;
}

// ============= Render walk =============

export interface PlacedBlock {
  block: Block;
  offsetX: number;
  offsetY: number;
}

export interface RenderGroup {
  offsetX: number;
  offsetY: number;
  boxes: LocalPersonBox[];
  childGroups: RenderGroup[];
}

export interface AbsoluteLine {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
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
      relativeOffsetX: placed.offsetX,
      relativeOffsetY: placed.offsetY,
      absoluteOriginX: placed.offsetX,
      absoluteOriginY: placed.offsetY
    });
    childGroups.push(result.group);
    lines.push(...result.lines);
  }
  return {
    rootGroup: { offsetX: 0, offsetY: 0, boxes: [], childGroups },
    lines
  };
}

interface RenderOneArgs {
  block: Block;
  relativeOffsetX: number;
  relativeOffsetY: number;
  absoluteOriginX: number;
  absoluteOriginY: number;
}

interface RenderOneResult {
  group: RenderGroup;
  lines: AbsoluteLine[];
}

function renderOneBlock(args: RenderOneArgs): RenderOneResult {
  const local = args.block.renderLocal();
  const lines: AbsoluteLine[] = local.lines.map((l) => ({
    key: l.key,
    x1: args.absoluteOriginX + l.x1,
    y1: args.absoluteOriginY + l.y1,
    x2: args.absoluteOriginX + l.x2,
    y2: args.absoluteOriginY + l.y2
  }));
  const childGroups: RenderGroup[] = [];
  for (const child of args.block.children) {
    const childResult = renderOneBlock({
      block: child.block,
      relativeOffsetX: child.offsetX,
      relativeOffsetY: child.offsetY,
      absoluteOriginX: args.absoluteOriginX + child.offsetX,
      absoluteOriginY: args.absoluteOriginY + child.offsetY
    });
    childGroups.push(childResult.group);
    lines.push(...childResult.lines);
  }
  return {
    group: {
      offsetX: args.relativeOffsetX,
      offsetY: args.relativeOffsetY,
      boxes: [...local.boxes],
      childGroups
    },
    lines
  };
}
