// Church-book references from a MyHeritage GEDCOM export, read from the
// SOUR citations whose PAGE, or failing that ROLE, names a MyHeritage
// record.

import { churchBookRefOf } from '@/server/citations/myheritage/record';
import type { ChurchBookRef } from '@/server/citations/myheritage/record';
import { parseGedcom } from '@/server/gedcom/parser';
import type { GedNode } from '@/server/gedcom/parser';

// A child's value, `tags` the path down to it.
function valueAt(node: GedNode, ...tags: string[]) {
  let at: GedNode | undefined = node;
  for (const tag of tags) at = at?.children.find((c) => c.tag === tag);
  return at?.value ?? null;
}

export function churchBookRefs(gedcom: string) {
  const out: ChurchBookRef[] = [];
  function walk(node: GedNode) {
    if (node.tag === 'SOUR' && node.level > 0) {
      const ref = churchBookRefOf(
        valueAt(node, 'PAGE'),
        valueAt(node, 'DATA', 'TEXT'),
        valueAt(node, 'EVEN', 'ROLE')
      );
      if (ref !== null) out.push(ref);
    }
    for (const c of node.children) walk(c);
  }
  for (const r of parseGedcom(gedcom)) walk(r);
  return out;
}
