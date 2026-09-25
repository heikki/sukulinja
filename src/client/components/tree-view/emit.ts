// The seam where layout's slot-unit / generation-unit offsets resolve to
// absolute pixels. LayoutOffset (see layout-node.ts) is in slot units on
// both axes — sub-slot x (sibship packing), integer-generation y;
// intra-family endpoints come in already in pixels.

import { FamilyNode } from './build/nodes/family-node';
import type { PersonSlot } from './build/nodes/family-node';
import type { LayoutNode } from './build/nodes/layout-node';
import { PersonNode } from './build/nodes/person-node';

export interface Point {
  x: number;
  y: number;
}

export interface Dims {
  boxW: number;
  boxH: number;
  gapX: number;
  gapY: number;
  tieOffset: number;
}

export interface Box {
  // Stable per-instance id: the path of node ids from the root. Unique even
  // under pedigree collapse, where one person is emitted as several boxes
  // (same personId). Used for keyed render and to match a box across a relayout.
  key: string;
  personId: number;
  pos: Point;
}

// A Tie, or a sibship's whole connector — its Drop, Bar and Legs drawn as one
// path so the outer turns can round (see connectors.ts).
export type LineKind = 'tie' | 'sibship';

// Family-local line before the walk anchors it: the bare key identifies the
// line within its family; `key` on DrawnLine prefixes it with the family's path.
interface RawLine {
  key: string;
  kind: LineKind;
  points: Point[];
  attach: string[];
}

export interface DrawnLine {
  // Path-prefixed, unique per instance (see Box.key); used as the render key.
  key: string;
  // The bare family-local key, shared by both instances of a collapsed family;
  // used to match an edge across a relayout that re-roots the chart.
  baseKey: string;
  // Tagged for paint-side dispatch; emit itself doesn't read this.
  kind: LineKind;
  // The geometry the path is drawn from. A Tie: its two ends. A sibship: the
  // Drop's top, a point on the Bar (its height), then each Leg's foot in kid
  // order. The Transition slides a line by moving these points.
  points: Point[];
  // Keys of the boxes this line connects: a Tie's spouses; for a sibship's
  // Drop, Bar and Legs — one connector — the parents it hangs from and every
  // kid. The Transition slides a line only when all of these slide, so a
  // connector fades out and back in with any part of it that does.
  attach: string[];
}

export interface Extents {
  min: Point;
  max: Point;
}

export interface EmitOutput {
  boxes: Box[];
  lines: DrawnLine[];
  extents: Extents;
}

// Where a FamilyNode sits in the walk: its own path, and the path and node of
// the parent it hangs from.
interface FamilyPlace {
  nodePath: string;
  path: string;
  parent: LayoutNode | null;
}

// Box keys of a family's member slots. An owned slot's box is a child of the
// family node; a slot without a node is the upstream PersonNode the family hangs
// from (its parent). An unknown person has no box and no key.
function slotKeys(slots: Array<PersonSlot | null>, place: FamilyPlace) {
  const keys: string[] = [];
  for (const slot of slots) {
    if (slot === null) continue;
    if (slot.node !== null) {
      keys.push(`${place.nodePath}/p${slot.personId}`);
    } else if (
      place.parent instanceof PersonNode &&
      place.parent.personId === slot.personId
    ) {
      keys.push(place.path);
    }
  }
  return keys;
}

// Per-node discriminator for the unique path key (see Box.key).
function nodeKey(node: LayoutNode): string {
  if (node instanceof PersonNode) return `p${node.personId}`;
  if (node instanceof FamilyNode) return `f${node.famId}`;
  return 'n';
}

export function emitLayout(
  root: LayoutNode,
  startAbs: Point,
  dims: Dims
): EmitOutput {
  const slotPitch = dims.boxW + dims.gapX;
  const rowPitch = dims.boxH + dims.gapY;
  const boxHalfSlot = dims.boxW / slotPitch / 2;
  const halfW = dims.boxW / 2;
  const halfH = dims.boxH / 2;
  const boxes: Box[] = [];
  const lines: DrawnLine[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  function walk(
    node: LayoutNode,
    abs: Point,
    path: string,
    parent: LayoutNode | null
  ) {
    // Each owned PersonNode / FamilyNode has a unique parent and its siblings
    // carry distinct ids, so this chain is a unique, relayout-stable path.
    const nodePath = path === '' ? nodeKey(node) : `${path}/${nodeKey(node)}`;
    if (node instanceof PersonNode) {
      const px = abs.x * slotPitch;
      const py = abs.y;
      boxes.push({
        key: nodePath,
        personId: node.personId,
        pos: { x: px, y: py }
      });
      if (px - halfW < minX) minX = px - halfW;
      if (py - halfH < minY) minY = py - halfH;
      if (px + halfW > maxX) maxX = px + halfW;
      if (py + halfH > maxY) maxY = py + halfH;
    } else if (node instanceof FamilyNode) {
      for (const line of familyLines(node, { nodePath, path, parent })) {
        lines.push({
          key: `${nodePath}/${line.key}`,
          baseKey: line.key,
          kind: line.kind,
          attach: line.attach,
          points: line.points.map((p) => ({
            x: (p.x + abs.x) * slotPitch,
            y: p.y + abs.y
          }))
        });
      }
    }
    for (const child of node.children) {
      walk(
        child,
        {
          x: abs.x + child.offset.x,
          y: abs.y + child.offset.y * rowPitch
        },
        nodePath,
        node
      );
    }
  }

  function familyLines(node: FamilyNode, place: FamilyPlace): RawLine[] {
    // Endpoints are in family-local coords (slot units for x, pixels for y).
    const out: RawLine[] = [];
    if (node.husband !== null && node.wife !== null) {
      // Husband-left convention can be violated by ancestor step-fams (the
      // step-spouse may sit on Fa's "wrong" side to match chronological
      // placement) — pick endpoints by X order, not by husband/wife roles.
      const leftX = Math.min(node.husband.localX, node.wife.localX);
      const rightX = Math.max(node.husband.localX, node.wife.localX);
      const ty =
        node.tieKind === 'centered'
          ? 0
          : node.tieKind === 'nonprimary-left'
            ? dims.tieOffset
            : -dims.tieOffset;
      out.push({
        key: `tie-${node.famId}`,
        kind: 'tie',
        points: [
          { x: leftX + boxHalfSlot, y: ty },
          { x: rightX - boxHalfSlot, y: ty }
        ],
        attach: slotKeys([node.husband, node.wife], place)
      });
    }
    if (node.kids.length > 0) {
      out.push(sibshipLine(node, place));
    }
    return out;
  }

  function sibshipLine(node: FamilyNode, place: FamilyPlace): RawLine {
    const { famId, husband, wife, kids, childAnchor } = node;
    const busY = rowPitch / 2;
    // Drop is always vertical (see CONTEXT.md "Bloodline pyramid", ADR-0001).
    // The Bar spans the union of childAnchor.x and the kid Xs — so a one-kid
    // sibship where the Tie sits off the kid's column (depth ≥ 2) still
    // connects via a horizontal run from the Drop to the kid's Leg.
    const anchorX = childAnchor.x;
    return {
      key: `sib-${famId}`,
      kind: 'sibship',
      points: [
        {
          x: anchorX,
          y: childAnchor.kind === 'tie-midpoint' ? 0 : dims.boxH / 2
        },
        { x: anchorX, y: busY },
        ...kids.map((k) => ({ x: k.localX, y: dims.boxH / 2 + dims.gapY }))
      ],
      // Drop, Bar and Legs are one connector between the couple and the kids
      // (see DrawnLine.attach). Both parents, whichever the Drop hangs from:
      // the anchor moves between a parent's box and the Tie as a marriage
      // turns primary or not across a relayout, but the connector is the same.
      attach: slotKeys([husband, wife, ...kids], place)
    };
  }

  walk(root, startAbs, '', null);
  return {
    boxes,
    lines,
    extents: { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } }
  };
}
