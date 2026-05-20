// The render walk keeps edges flat at the top level so box-over-edge
// z-order is preserved without any per-Block bookkeeping.

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

export interface PlacedBlock {
  block: Block;
  offsetX: number;
  offsetY: number;
}

export abstract class Block {
  abstract readonly leftWidth: number;
  abstract readonly rightWidth: number;
  abstract readonly children: readonly PlacedBlock[];

  abstract renderLocal(): LocalRenderOutput;

  abstract personLocalPos(personId: number): LocalPos | null;
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
      offsetX: placed.offsetX,
      offsetY: placed.offsetY,
      absX: placed.offsetX,
      absY: placed.offsetY
    });
    childGroups.push(result.group);
    lines.push(...result.lines);
  }
  return {
    rootGroup: { offsetX: 0, offsetY: 0, boxes: [], childGroups },
    lines
  };
}

// `offsetX/Y` is the group-local offset (written to group.offsetX/Y so SVG
// transforms compose). `absX/Y` is the accumulated chart-coord origin, used
// to translate lines into chart coords directly (lines are emitted flat at
// the top level — see file header).
interface RenderOneArgs {
  block: Block;
  offsetX: number;
  offsetY: number;
  absX: number;
  absY: number;
}

interface RenderOneResult {
  group: RenderGroup;
  lines: AbsoluteLine[];
}

function renderOneBlock(args: RenderOneArgs): RenderOneResult {
  const { block, offsetX, offsetY, absX, absY } = args;
  const local = block.renderLocal();
  const lines: AbsoluteLine[] = local.lines.map((l) => ({
    key: l.key,
    x1: absX + l.x1,
    y1: absY + l.y1,
    x2: absX + l.x2,
    y2: absY + l.y2
  }));
  const childGroups: RenderGroup[] = [];
  for (const child of block.children) {
    const childResult = renderOneBlock({
      block: child.block,
      offsetX: child.offsetX,
      offsetY: child.offsetY,
      absX: absX + child.offsetX,
      absY: absY + child.offsetY
    });
    childGroups.push(childResult.group);
    lines.push(...childResult.lines);
  }
  return {
    group: { offsetX, offsetY, boxes: local.boxes, childGroups },
    lines
  };
}
