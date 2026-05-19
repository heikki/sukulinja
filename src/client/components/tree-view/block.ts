/* eslint-disable @typescript-eslint/class-methods-use-this --
   FamilyBlock stubs throw before reaching `this` (phase 4 will populate the
   getters with `this.spec` access and drop this disable). */

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
import type { LayoutIndices, Line, PositionedPerson } from './helpers';

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

// ============= FamilyBlock — Couple (or lone parent) + their sibship =============

// When set, this FamilyBlock's "missing" adult is rendered in a different
// FamilyBlock (the step-family case). The cross-Block Tie connector reaches
// across to that other Block.
export interface ExternalSpouseRef {
  personId: number;
  side: 'mother' | 'father';
}

export interface FamilyBlockSpec {
  // The Family in the underlying data model (used for key generation).
  famId: number;
  // Adults: at least one of husbandId/wifeId must be non-null.
  husbandId: number | null;
  wifeId: number | null;
  // The children of this Family. Each is its own Block.
  childBlocks: readonly Block[];
  // Step-family case: the missing adult here is rendered in another
  // FamilyBlock; a cross-Block Tie will connect them at render time.
  externalSpouseRef: ExternalSpouseRef | null;
}

export class FamilyBlock extends Block {
  constructor(readonly spec: FamilyBlockSpec) {
    super();
  }

  // Layout impls land in phase 4 (focus row + descendant).
  get leftWidth(): number {
    throw new Error('FamilyBlock.leftWidth: phase 4');
  }
  get rightWidth(): number {
    throw new Error('FamilyBlock.rightWidth: phase 4');
  }
  get children(): readonly PlacedChild[] {
    throw new Error('FamilyBlock.children: phase 4');
  }
  renderLocal(): LocalRenderOutput {
    throw new Error('FamilyBlock.renderLocal: phase 4');
  }
  personLocalPos(personId: number): LocalPos | null {
    throw new Error(`FamilyBlock.personLocalPos(${personId}): phase 4`);
  }

  override crossBlockConnectors(): readonly CrossBlockConnector[] {
    if (this.spec.externalSpouseRef === null) return [];
    const visibleParentId = this.spec.husbandId ?? this.spec.wifeId;
    if (visibleParentId === null) return [];
    return [
      {
        key: `step-tie-${this.spec.famId}`,
        fromPersonId: visibleParentId,
        toPersonId: this.spec.externalSpouseRef.personId,
        style: 'step-tie'
      }
    ];
  }
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

// ============= Flat-output adapter =============

// Walk a Block tree and produce the legacy flat { nodes, lines } shape, with
// every position translated into chart coords. originX/originY = chart pos
// of the Block's local origin. Used during the phased refactor so consumers
// of the old SubLayout API keep working.
export function flattenBlock(
  block: Block,
  originX: number,
  originY: number
): { nodes: PositionedPerson[]; lines: Line[] } {
  const local = block.renderLocal();
  const nodes: PositionedPerson[] = local.boxes.map((b) => ({
    id: b.personId,
    x: originX + b.x,
    y: originY + b.y
  }));
  const lines: Line[] = local.lines.map((l) => ({
    key: l.key,
    x1: originX + l.x1,
    y1: originY + l.y1,
    x2: originX + l.x2,
    y2: l.y2 + originY
  }));
  for (const placed of block.children) {
    const sub = flattenBlock(
      placed.block,
      originX + placed.offsetX,
      originY + placed.offsetY
    );
    nodes.push(...sub.nodes);
    lines.push(...sub.lines);
  }
  return { nodes, lines };
}

// ============= Render-walk output (phase 5) =============

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
