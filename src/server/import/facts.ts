// A person's or family's events and attributes, each a fact row with its
// place and address; and the addresses of repositories and submitters.

import type { Scope } from '@/common/types';

import type { GedNode } from '../gedcom/parser';
import { EVENTS } from '../gedcom/tags';
import { gedcom7Age, gedcom7Date } from '../gedcom/values';
import type { ImportStatements } from './statements';
import { isEmptyLine } from './unstored';
import type { LineReader } from './unstored';

type Importer<O extends string> = (
  node: GedNode,
  owner: O,
  ownerId: number
) => void;

interface FactImporter {
  sql: ImportStatements;
  lines: LineReader;
  // Called for each fact written.
  count: () => void;
  importNotes: Importer<'fact' | 'place'>;
  importCitations: Importer<'fact'>;
  importMediaLinks: Importer<'fact'>;
}

export function factImporter({
  sql,
  lines,
  count,
  importNotes,
  importCitations,
  importMediaLinks
}: FactImporter) {
  const { take, takeValue } = lines;

  // An ADDR's lines, by the address columns they're kept in.
  function addressParts(addr: GedNode) {
    return {
      $line1: takeValue(addr, 'ADR1'),
      $line2: takeValue(addr, 'ADR2'),
      $line3: takeValue(addr, 'ADR3'),
      $city: takeValue(addr, 'CITY'),
      $state: takeValue(addr, 'STAE'),
      $postal_code: takeValue(addr, 'POST'),
      $country: takeValue(addr, 'CTRY')
    };
  }

  function importAddress(
    node: GedNode,
    owner: 'repository' | 'submitter',
    ownerId: number
  ) {
    const addr = take(node, 'ADDR');
    if (addr === undefined) return;
    sql.insertAddress.run({
      $owner_type: owner,
      $owner_id: ownerId,
      $text: addr.value ?? null,
      ...addressParts(addr)
    });
  }

  // An event's PLAC: its name, where it is on the map, and its notes.
  function readPlace(node: GedNode) {
    const plac = take(node, 'PLAC');
    const map = plac === undefined ? undefined : take(plac, 'MAP');
    return {
      plac,
      name: plac?.value ?? null,
      latitude: takeValue(map, 'LATI'),
      longitude: takeValue(map, 'LONG')
    };
  }

  // An event's ADDR, its parts kept and its lines joined for showing.
  // MyHeritage records residences this way rather than with PLAC.
  function readAddress(node: GedNode) {
    const addr = take(node, 'ADDR');
    if (addr === undefined) return null;
    const text = addr.value ?? null;
    const parts = addressParts(addr);
    const lines = [text, ...Object.values(parts)].filter(
      (x): x is string => x !== null && x.trim() !== ''
    );
    return { text, parts, shown: lines.length === 0 ? null : lines.join(', ') };
  }

  // An event with nothing more to say is GEDCOM 7's `BIRT Y`: it happened.
  // An empty attribute says nothing and isn't kept.
  function importFacts(
    root: GedNode,
    scope: Scope,
    scopeId: number,
    tags: Set<string>
  ) {
    let order = 0;
    for (const child of root.children) {
      if (!tags.has(child.tag)) continue;
      if (!isEmptyLine(child)) {
        insertFactRow(
          { scope, id: scopeId },
          child,
          child.value ?? null,
          order++
        );
      } else if (EVENTS.has(child.tag)) {
        insertFactRow({ scope, id: scopeId }, child, 'Y', order++);
      } else {
        lines.use(child);
      }
    }
  }

  function insertFactRow(
    owner: { scope: Scope; id: number },
    node: GedNode,
    value: string | null,
    order: number
  ): void {
    lines.use(node);
    const place = readPlace(node);
    const address = readAddress(node);
    const res = sql.insertFact.run({
      $scope_type: owner.scope,
      $scope_id: owner.id,
      $tag: node.tag,
      $type: takeValue(node, 'TYPE'),
      $date_text: gedcom7Date(takeValue(node, 'DATE')),
      $place: place.name,
      $latitude: place.latitude,
      $longitude: place.longitude,
      $address: address?.shown ?? null,
      $age: gedcom7Age(takeValue(node, 'AGE')),
      $cause: takeValue(node, 'CAUS'),
      $agency: takeValue(node, 'AGNC'),
      $value: value,
      $sort_order: order
    });
    const factId = Number(res.lastInsertRowid);
    if (address !== null) {
      sql.insertAddress.run({
        $owner_type: 'fact',
        $owner_id: factId,
        $text: address.text,
        ...address.parts
      });
    }
    if (place.plac !== undefined) importNotes(place.plac, 'place', factId);
    importNotes(node, 'fact', factId);
    importCitations(node, 'fact', factId);
    importMediaLinks(node, 'fact', factId);
    count();
  }

  return { importFacts, importAddress };
}
