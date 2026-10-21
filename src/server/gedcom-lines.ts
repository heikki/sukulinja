// Which lines of a GEDCOM an import stored, so the rest can be listed
// (ADR-0013).

import { findChild, findChildren } from './gedcom-parser';
import type { GedNode } from './gedcom-parser';

// A kind of line the import couldn't store, by its path from the record
// (`INDI.BIRT.CAUS`), and how many there were.
export interface Unstored {
  path: string;
  count: number;
}

// Reads lines, remembering each one it reads.
export function lineReader() {
  const used = new Set<GedNode>();
  function take(node: GedNode, tag: string) {
    const child = findChild(node, tag);
    if (child !== undefined) used.add(child);
    return child;
  }
  return {
    use: (node: GedNode) => {
      used.add(node);
    },
    take,
    takeAll: (node: GedNode, tag: string) => {
      const children = findChildren(node, tag);
      for (const c of children) used.add(c);
      return children;
    },
    takeValue: (node: GedNode | undefined, tag: string) => {
      if (node === undefined) return null;
      return take(node, tag)?.value ?? null;
    },
    unstored: (roots: GedNode[]) => unstoredLines(roots, used)
  };
}

// Records that say nothing about the tree: the header is written afresh on
// export.
const SKIPPED_RECORDS = new Set(['HEAD', 'TRLR']);

// Every standard line not in `used`, by path. Below a line that wasn't
// stored, nothing more is counted.
function unstoredLines(roots: GedNode[], used: Set<GedNode>): Unstored[] {
  const counts = new Map<string, number>();
  function count(path: string) {
    counts.set(path, (counts.get(path) ?? 0) + 1);
  }
  function walk(node: GedNode, path: string) {
    for (const child of node.children) {
      if (child.tag.startsWith('_')) continue;
      const childPath = `${path}.${child.tag}`;
      if (used.has(child)) walk(child, childPath);
      else count(childPath);
    }
  }
  for (const root of roots) {
    if (SKIPPED_RECORDS.has(root.tag) || root.tag.startsWith('_')) continue;
    if (used.has(root)) walk(root, root.tag);
    else count(root.tag);
  }
  return [...counts]
    .map(([path, n]) => ({ path, count: n }))
    .sort((x, y) => x.path.localeCompare(y.path));
}

export type LineReader = ReturnType<typeof lineReader>;
