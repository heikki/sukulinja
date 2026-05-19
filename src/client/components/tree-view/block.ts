// Block tree types for the layout refactor.
//
// Every layout unit is a Block with:
//   - a local coordinate frame (origin at 0, 0; pivot at x=0)
//   - leftWidth / rightWidth = how far content extends from the pivot
//   - children placed at offsets relative to this Block's origin
//   - renderLocal() output in this Block's coords (translated lazily at
//     render time)
//
// The render walk converts boxes into nested <g transform> groups and
// flattens lines into one top-level edge group (preserving the box-over-
// edge z-order called out in docs/adr/0001-tree-view-layout-architecture.md).
//
// DescendantUnitBlock lives in block-descendant.ts to keep this file under
// the lint file-size limit. Phase-6 cleanup may split further.

import { BOX_H, BOX_W, COUPLE_GAP, COUPLE_PITCH, ROW_H } from './helpers';
import type { LayoutIndices } from './helpers';

// ============= Local render output (one Block's contribution) =============

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

// ============= Block tree =============

export interface PlacedChild {
  block: Block;
  offsetX: number;
  offsetY: number;
}

// A connector between a person inside this Block and a person inside some
// other Block. Resolved at render time by looking up both endpoints'
// absolute positions in the personId → absolute-pos map.
export interface CrossBlockConnector {
  key: string;
  fromPersonId: number;
  toPersonId: number;
  style: 'step-tie';
}

export abstract class Block {
  abstract readonly leftWidth: number;
  abstract readonly rightWidth: number;
  abstract readonly children: readonly PlacedChild[];

  // Boxes and lines this Block draws in its own local frame.
  abstract renderLocal(): LocalRenderOutput;

  // Find a rendered person's position in this Block's local frame, including
  // any nested child Block. Returns null if not rendered anywhere inside.
  abstract personLocalPos(personId: number): LocalPos | null;

  // Cross-Block connectors this Block declares. Default: none.
  // eslint-disable-next-line @typescript-eslint/class-methods-use-this -- abstract-base default
  crossBlockConnectors(): readonly CrossBlockConnector[] {
    return [];
  }
}

// ============= PersonBlock — one lone rendered person =============

export class PersonBlock extends Block {
  readonly leftWidth = BOX_W / 2;
  readonly rightWidth = BOX_W / 2;
  readonly children: readonly PlacedChild[] = [];

  constructor(readonly personId: number) {
    super();
  }

  renderLocal(): LocalRenderOutput {
    return {
      boxes: [{ personId: this.personId, x: 0, y: 0 }],
      lines: []
    };
  }

  personLocalPos(personId: number): LocalPos | null {
    return personId === this.personId ? { x: 0, y: 0 } : null;
  }
}

// ============= AncestorBranchBlock — bloodline person + recursive ancestors =============
//
// Represents one bloodline ancestor (the person at local (0, 0)) plus their
// parent Family above (Couple at local y=-ROW_H, recursively expanding
// upward via fatherBranch and motherBranch placed as children).
//
// This Block does NOT draw its parent boxes — those are drawn by the
// recursive father/motherBranch when walked, since each is centered on its
// own bloodline person.

export class AncestorBranchBlock extends Block {
  readonly leftWidth: number;
  readonly rightWidth: number;
  readonly children: readonly PlacedChild[];
  readonly separation: number;

  constructor(
    readonly personId: number,
    readonly parentFamilyId: number | null,
    readonly fatherBranch: AncestorBranchBlock | null,
    readonly motherBranch: AncestorBranchBlock | null
  ) {
    super();
    if (fatherBranch !== null && motherBranch !== null) {
      const required =
        fatherBranch.rightWidth + motherBranch.leftWidth + COUPLE_GAP;
      this.separation = Math.max(COUPLE_PITCH, required);
      this.leftWidth = Math.max(
        BOX_W / 2,
        this.separation / 2 + fatherBranch.leftWidth
      );
      this.rightWidth = Math.max(
        BOX_W / 2,
        this.separation / 2 + motherBranch.rightWidth
      );
      this.children = [
        { block: fatherBranch, offsetX: -this.separation / 2, offsetY: -ROW_H },
        { block: motherBranch, offsetX: this.separation / 2, offsetY: -ROW_H }
      ];
    } else if (fatherBranch !== null) {
      this.separation = 0;
      this.leftWidth = Math.max(BOX_W / 2, fatherBranch.leftWidth);
      this.rightWidth = Math.max(BOX_W / 2, fatherBranch.rightWidth);
      this.children = [{ block: fatherBranch, offsetX: 0, offsetY: -ROW_H }];
    } else if (motherBranch === null) {
      this.separation = 0;
      this.leftWidth = BOX_W / 2;
      this.rightWidth = BOX_W / 2;
      this.children = [];
    } else {
      this.separation = 0;
      this.leftWidth = Math.max(BOX_W / 2, motherBranch.leftWidth);
      this.rightWidth = Math.max(BOX_W / 2, motherBranch.rightWidth);
      this.children = [{ block: motherBranch, offsetX: 0, offsetY: -ROW_H }];
    }
  }

  renderLocal(): LocalRenderOutput {
    const boxes: LocalPersonBox[] = [{ personId: this.personId, x: 0, y: 0 }];
    const lines: LocalLine[] = [];

    if (this.parentFamilyId !== null && this.children.length > 0) {
      const coupleY = -ROW_H;
      const bothParents =
        this.fatherBranch !== null && this.motherBranch !== null;
      if (bothParents) {
        lines.push({
          key: `tie-${this.parentFamilyId}`,
          x1: -this.separation / 2 + BOX_W / 2,
          y1: coupleY,
          x2: this.separation / 2 - BOX_W / 2,
          y2: coupleY
        });
      }
      const anchorY = bothParents ? coupleY : coupleY + BOX_H / 2;
      lines.push({
        key: `pdrop-${this.parentFamilyId}-${this.personId}`,
        x1: 0,
        y1: anchorY,
        x2: 0,
        y2: -BOX_H / 2
      });
    }

    return { boxes, lines };
  }

  personLocalPos(personId: number): LocalPos | null {
    if (personId === this.personId) return { x: 0, y: 0 };
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
}

// ============= FamilyBlock — see block-family.ts =============

// When set, a FamilyBlock's "missing" adult is rendered in a different
// FamilyBlock (the step-family case). The cross-Block Tie connector reaches
// across to that other Block.
export interface ExternalSpouseRef {
  personId: number;
  side: 'mother' | 'father';
}

// ============= Builders =============

// Recursively build the AncestorBranchBlock for one bloodline person,
// stopping at ix.levels or when no parent Family is known.
export function buildAncestorBranchBlock(
  personId: number,
  depth: number,
  ix: LayoutIndices
): AncestorBranchBlock {
  if (depth >= ix.levels) {
    return new AncestorBranchBlock(personId, null, null, null);
  }
  const fam = ix.parentFamByPerson.get(personId);
  if (fam === undefined) {
    return new AncestorBranchBlock(personId, null, null, null);
  }
  const fatherBranch =
    fam.husband_id !== null && ix.persons.has(fam.husband_id)
      ? buildAncestorBranchBlock(fam.husband_id, depth + 1, ix)
      : null;
  const motherBranch =
    fam.wife_id !== null && ix.persons.has(fam.wife_id)
      ? buildAncestorBranchBlock(fam.wife_id, depth + 1, ix)
      : null;
  if (fatherBranch === null && motherBranch === null) {
    return new AncestorBranchBlock(personId, null, null, null);
  }
  return new AncestorBranchBlock(personId, fam.id, fatherBranch, motherBranch);
}

// ============= Render walk =============

// A Block placed at chart-coord origin (used to drive the render walk).
export interface PlacedBlock {
  block: Block;
  offsetX: number;
  offsetY: number;
}

// Walk a Block tree and emit a structured RenderGroup tree (one nested
// transform group per Block) plus a flat list of edges in absolute coords.
// Boxes are nested so animations and CSS scoping can target whole sub-trees;
// edges stay flat at the top level so the box-over-edge z-order rule from
// docs/adr/0001-tree-view-layout-architecture.md is preserved without effort.
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
  const {
    block,
    relativeOffsetX,
    relativeOffsetY,
    absoluteOriginX,
    absoluteOriginY
  } = args;
  const local = block.renderLocal();
  const lines: AbsoluteLine[] = local.lines.map((l) => ({
    key: l.key,
    x1: absoluteOriginX + l.x1,
    y1: absoluteOriginY + l.y1,
    x2: absoluteOriginX + l.x2,
    y2: absoluteOriginY + l.y2
  }));
  const childGroups: RenderGroup[] = [];
  for (const child of block.children) {
    const childResult = renderOneBlock({
      block: child.block,
      relativeOffsetX: child.offsetX,
      relativeOffsetY: child.offsetY,
      absoluteOriginX: absoluteOriginX + child.offsetX,
      absoluteOriginY: absoluteOriginY + child.offsetY
    });
    childGroups.push(childResult.group);
    lines.push(...childResult.lines);
  }
  return {
    group: {
      offsetX: relativeOffsetX,
      offsetY: relativeOffsetY,
      boxes: [...local.boxes],
      childGroups
    },
    lines
  };
}

// ============= Render-walk output =============

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
