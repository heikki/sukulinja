// The seam where layout's slot-unit / generation-unit offsets resolve to
// absolute pixels. LayoutOffset (see layout-node.ts) is in slot units on
// both axes — sub-slot x (sibship packing), integer-generation y;
// intra-family endpoints come in already in pixels.

import { FamilyNode } from './build/nodes/family-node';
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

export type LineKind = 'tie' | 'drop' | 'bar' | 'leg';

// Family-local line before the walk anchors it: the bare key identifies the
// line within its family; `key` on DrawnLine prefixes it with the family's path.
interface RawLine {
  key: string;
  kind: LineKind;
  from: Point;
  to: Point;
}

export interface DrawnLine {
  // Path-prefixed, unique per instance (see Box.key); used as the render key.
  key: string;
  // The bare family-local key, shared by both instances of a collapsed family;
  // used to match an edge across a relayout that re-roots the chart.
  baseKey: string;
  // Tagged for paint-side dispatch; emit itself doesn't read this.
  kind: LineKind;
  from: Point;
  to: Point;
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

  function walk(node: LayoutNode, abs: Point, path: string) {
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
      for (const line of familyLines(node)) {
        lines.push({
          key: `${nodePath}/${line.key}`,
          baseKey: line.key,
          kind: line.kind,
          from: {
            x: (line.from.x + abs.x) * slotPitch,
            y: line.from.y + abs.y
          },
          to: { x: (line.to.x + abs.x) * slotPitch, y: line.to.y + abs.y }
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
        nodePath
      );
    }
  }

  function familyLines(node: FamilyNode): RawLine[] {
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
        from: { x: leftX + boxHalfSlot, y: ty },
        to: { x: rightX - boxHalfSlot, y: ty }
      });
    }
    if (node.kids.length > 0) {
      appendSibshipLines(node, out);
    }
    return out;
  }

  function appendSibshipLines(node: FamilyNode, out: RawLine[]) {
    const { famId, kids, childAnchor } = node;
    const busY = rowPitch / 2;
    const anchorPoint: Point = {
      x: childAnchor.x,
      y: childAnchor.kind === 'tie-midpoint' ? 0 : dims.boxH / 2
    };
    // Drop is always vertical (see CONTEXT.md "Bloodline pyramid", ADR-0001).
    // The bar spans the union of childAnchor.x and the kid Xs — so a
    // one-kid sibship where the Tie sits off the kid's column (depth ≥ 2)
    // still connects via a horizontal bar from the drop to the kid's leg.
    out.push({
      key: `sib-${famId}-drop`,
      kind: 'drop',
      from: anchorPoint,
      to: { x: anchorPoint.x, y: busY }
    });
    let minX = anchorPoint.x;
    let maxX = anchorPoint.x;
    for (const k of kids) {
      if (k.localX < minX) minX = k.localX;
      if (k.localX > maxX) maxX = k.localX;
    }
    // Emit the bar even when it collapses to a point (a single kid under a
    // centered Tie): a zero-length segment is invisible with the default butt
    // linecap, but it gives the Transition a stable, keyed element to morph as
    // the sibship widens or narrows across a relayout.
    out.push({
      key: `sib-${famId}-bar`,
      kind: 'bar',
      from: { x: minX, y: busY },
      to: { x: maxX, y: busY }
    });
    for (const k of kids) {
      out.push({
        key: `sib-${famId}-leg-${k.personId}`,
        kind: 'leg',
        from: { x: k.localX, y: busY },
        to: { x: k.localX, y: dims.boxH / 2 + dims.gapY }
      });
    }
  }

  walk(root, startAbs, '');
  return {
    boxes,
    lines,
    extents: { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } }
  };
}
