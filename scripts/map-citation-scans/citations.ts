// Church-record citations from a MyHeritage GEDCOM export: the SOUR
// citations whose PAGE is a MyHeritage record URL.

import {
  CHURCH_COLLECTIONS,
  parseCitation
} from '@server/citation-scans/record';
import type { Citation } from '@server/citation-scans/record';
import { parseGedcom } from '@server/gedcom-parser';
import type { GedNode } from '@server/gedcom-parser';

export function churchCitations(gedcom: string) {
  const out: Citation[] = [];
  function walk(node: GedNode) {
    if (node.tag === 'SOUR' && node.level > 0) {
      const page = node.children.find((c) => c.tag === 'PAGE')?.value;
      const text = node.children
        .find((c) => c.tag === 'DATA')
        ?.children.find((c) => c.tag === 'TEXT')?.value;
      if (page !== undefined && /^https?:/.test(page)) {
        out.push(parseCitation(page, text ?? ''));
      }
    }
    for (const c of node.children) walk(c);
  }
  for (const r of parseGedcom(gedcom)) walk(r);
  return out.filter((c) => CHURCH_COLLECTIONS.has(c.collection));
}
