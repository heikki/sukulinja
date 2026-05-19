/* eslint-disable @typescript-eslint/class-methods-use-this --
   Block is an abstract base. Some concrete impls (PersonBlock constants,
   crossBlockConnectors default) don't reference instance state — a normal
   OOP pattern. Phase 2 FamilyBlock stubs throw before reaching `this`. */

// Block tree types for the layout refactor (phase 1 of the Block-tree
// architecture).
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

import { BOX_W } from './helpers';

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
  abstract get leftWidth(): number;
  abstract get rightWidth(): number;
  abstract get children(): readonly PlacedChild[];

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
  constructor(readonly personId: number) {
    super();
  }

  get leftWidth(): number {
    return BOX_W / 2;
  }

  get rightWidth(): number {
    return BOX_W / 2;
  }

  get children(): readonly PlacedChild[] {
    return [];
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
  // Adults: at least one of husbandId/wifeId must be non-null. Both null
  // would mean a Family with no rendered adult, which doesn't occur.
  husbandId: number | null;
  wifeId: number | null;
  // The children of this Family. Each is its own Block (PersonBlock if leaf,
  // FamilyBlock if they have their own family rendered).
  childBlocks: readonly Block[];
  // Step-family case: the missing adult here is rendered in another
  // FamilyBlock; a cross-Block Tie will connect them at render time.
  externalSpouseRef: ExternalSpouseRef | null;
}

export class FamilyBlock extends Block {
  constructor(readonly spec: FamilyBlockSpec) {
    super();
  }

  // Layout impls land in phase 2.
  get leftWidth(): number {
    throw new Error('FamilyBlock.leftWidth: phase 2');
  }
  get rightWidth(): number {
    throw new Error('FamilyBlock.rightWidth: phase 2');
  }
  get children(): readonly PlacedChild[] {
    throw new Error('FamilyBlock.children: phase 2');
  }
  renderLocal(): LocalRenderOutput {
    throw new Error('FamilyBlock.renderLocal: phase 2');
  }
  personLocalPos(personId: number): LocalPos | null {
    throw new Error(`FamilyBlock.personLocalPos(${personId}): phase 2`);
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

// ============= Render-walk output =============

// Boxes form a tree of nested groups; each group's transform applies to its
// own boxes and recursively to its child groups.
export interface RenderGroup {
  offsetX: number;
  offsetY: number;
  boxes: LocalPersonBox[];
  childGroups: RenderGroup[];
}

// Edges are flattened to absolute coords, emitted in one top-level group.
// This preserves the box-over-edge z-order rule from the ADR (sibship Bar
// passes behind any inserted spouse box).
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
