import type { Database } from 'bun:sqlite';

import type { Scope } from '@common/types';

import { lineReader } from './gedcom-lines';
import type { Unstored } from './gedcom-lines';
import { parseName } from './gedcom-names';
import { findChildren } from './gedcom-parser';
import type { GedNode } from './gedcom-parser';
import {
  ADDRESS_PARTS,
  EVENTS,
  FAMILY_FACT_TAGS,
  HEADER_META,
  NAME_PIECE_TAGS,
  PERSON_FACT_TAGS
} from './gedcom-tags';
import {
  gedcom7Age,
  gedcom7Date,
  gedcom7Quality,
  languageTag
} from './gedcom7-values';
import { linkReader, linkValues } from './import-links';
import { mediaLinker } from './import-media';
import type { MediaResolver } from './import-media';
import { importStatements } from './import-statements';
import { objectRecords } from './media-refs';

export type { Unstored } from './gedcom-lines';

export interface ImportStats {
  persons: number;
  families: number;
  names: number;
  facts: number;
  media: number;
  mediaLinks: number;
  familyChildren: number;
  sources: number;
  citations: number;
  notes: number;
  // People and families the file gave no UID, who were given a new one.
  newUids: number;
  // Standard lines left out; program-specific `_` lines aren't counted.
  unstored: Unstored[];
}

function hasXref(root: GedNode): root is GedNode & { xref: string } {
  return root.xref !== undefined && root.xref !== '';
}

function toInt(value: string | undefined): number | null {
  if (value === undefined) return null;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

const POINTER_RE = /^@[^@]+@$/;

// A line with no value and nothing under it but program-specific lines:
// GEDCOM 7 has no such structure, and it says nothing.
function isEmptyLine(node: GedNode): boolean {
  return (
    (node.value ?? '') === '' &&
    node.children.every((c) => c.tag.startsWith('_') || isEmptyLine(c))
  );
}

function isPointer(value: string | undefined) {
  return POINTER_RE.test(value ?? '');
}

type NoteOwner =
  | 'person'
  | 'family'
  | 'fact'
  | 'place'
  | 'name'
  | 'source'
  | 'citation'
  | 'media_link'
  | 'association';

type CitationScope = Scope | 'fact' | 'name' | 'note' | 'shared_note';

export function importGedcom(
  db: Database,
  roots: GedNode[],
  mediaResolver: MediaResolver
): ImportStats {
  const personXrefs = new Map<string, number>();
  const familyXrefs = new Map<string, number>();
  const sourceXrefs = new Map<string, number>();
  const sharedNoteXrefs = new Map<string, number>();
  const repositoryXrefs = new Map<string, number>();
  const stats: ImportStats = {
    persons: 0,
    families: 0,
    names: 0,
    facts: 0,
    media: 0,
    mediaLinks: 0,
    familyChildren: 0,
    sources: 0,
    citations: 0,
    notes: 0,
    newUids: 0,
    unstored: []
  };

  // Each line stored, so that what's left can be listed.
  const lines = lineReader();
  const { take, takeAll, takeValue } = lines;

  // An enumeration line's value: its PHRASE where GEDCOM 7 gives one for
  // what the enumeration can't name.
  function enumValue(node: GedNode | undefined) {
    if (node === undefined) return null;
    return takeValue(node, 'PHRASE') ?? node.value ?? null;
  }

  const sql = importStatements(db);
  const importMediaLinks = mediaLinker({
    sql,
    lines,
    count: (kind) => {
      stats[kind] += 1;
    },
    resolve: mediaResolver,
    records: objectRecords(roots),
    importNotes
  });

  const readLink = linkReader(roots, lines);

  // A record's UID, or a new one: only a UID says reliably who is who from
  // one file to the next (ADR-0013).
  function uidOf(root: GedNode) {
    const uid = takeValue(root, 'UID');
    if (uid === null) stats.newUids += 1;
    return uid ?? crypto.randomUUID();
  }

  // When a record was last changed, as the file says.
  function changeOf(root: GedNode) {
    const chan = take(root, 'CHAN');
    const date = chan === undefined ? undefined : take(chan, 'DATE');
    return { date: date?.value ?? null, time: takeValue(date, 'TIME') };
  }

  function importHeader(head: GedNode) {
    for (const [path, key] of HEADER_META) {
      let node: GedNode | undefined = head;
      for (const tag of path) {
        node = node === undefined ? node : take(node, tag);
      }
      if (node?.value !== undefined) {
        const value = key === 'language' ? languageTag(node.value) : node.value;
        sql.insertMeta.run(key, value);
      }
    }
  }

  function addressParts(addr: GedNode) {
    return ADDRESS_PARTS.map((tag) => takeValue(addr, tag));
  }

  function importAddress(
    node: GedNode,
    owner: 'repository' | 'submitter',
    ownerId: number
  ) {
    const addr = take(node, 'ADDR');
    if (addr === undefined) return;
    sql.insertAddress.run(
      owner,
      ownerId,
      addr.value ?? null,
      ...addressParts(addr)
    );
  }

  // The records others point at come first, so a pointer always finds its
  // target: people, families, sources, repositories and shared notes.
  function createRecord(root: GedNode): void {
    if (!hasXref(root)) return;
    if (root.tag === 'INDI') {
      lines.use(root);
      const change = changeOf(root);
      const res = sql.insertPerson.run(
        root.xref,
        uidOf(root),
        takeValue(root, 'SEX'),
        change.date,
        change.time
      );
      personXrefs.set(root.xref, Number(res.lastInsertRowid));
      stats.persons += 1;
    } else if (root.tag === 'FAM') {
      lines.use(root);
      const change = changeOf(root);
      const res = sql.insertFamily.run(
        root.xref,
        uidOf(root),
        change.date,
        change.time
      );
      familyXrefs.set(root.xref, Number(res.lastInsertRowid));
      stats.families += 1;
    } else if (root.tag === 'SOUR') {
      createSource(root);
    } else if (root.tag === 'REPO') {
      lines.use(root);
      const change = changeOf(root);
      const res = sql.insertRepository.run(
        root.xref,
        takeValue(root, 'NAME'),
        takeValue(root, 'PHON'),
        change.date,
        change.time
      );
      const repoId = Number(res.lastInsertRowid);
      repositoryXrefs.set(root.xref, repoId);
      importAddress(root, 'repository', repoId);
    } else if (root.tag === 'NOTE' || root.tag === 'SNOTE') {
      lines.use(root);
      const change = changeOf(root);
      const res = sql.insertSharedNote.run(
        root.xref,
        root.value ?? '',
        change.date,
        change.time
      );
      sharedNoteXrefs.set(root.xref, Number(res.lastInsertRowid));
    } else if (root.tag === 'SUBM') {
      createSubmitter(root);
    }
  }

  function createSource(root: GedNode & { xref: string }) {
    lines.use(root);
    const change = changeOf(root);
    const data = take(root, 'DATA');
    const res = sql.insertSource.run(
      root.xref,
      takeValue(root, 'TITL'),
      takeValue(root, 'AUTH'),
      takeValue(root, 'PUBL'),
      takeValue(root, 'TEXT'),
      takeValue(data, 'EVEN'),
      change.date,
      change.time
    );
    sourceXrefs.set(root.xref, Number(res.lastInsertRowid));
    stats.sources += 1;
  }

  function createSubmitter(root: GedNode & { xref: string }) {
    lines.use(root);
    const change = changeOf(root);
    const res = sql.insertSubmitter.run(
      root.xref,
      takeValue(root, 'NAME'),
      takeValue(root, 'PHON'),
      takeValue(root, 'EMAIL'),
      takeValue(root, 'WWW'),
      change.date,
      change.time
    );
    importAddress(root, 'submitter', Number(res.lastInsertRowid));
  }

  function populateRecord(root: GedNode): void {
    if (root.tag === 'HEAD') {
      importHeader(root);
      return;
    }
    if (!hasXref(root)) return;
    if (root.tag === 'INDI') {
      importPersonDetails(root, personXrefs.get(root.xref)!);
    } else if (root.tag === 'FAM') {
      importFamilyDetails(root, familyXrefs.get(root.xref)!);
    } else if (root.tag === 'SOUR') {
      importSourceDetails(root, sourceXrefs.get(root.xref)!);
    } else if (root.tag === 'NOTE' || root.tag === 'SNOTE') {
      const noteId = sharedNoteXrefs.get(root.xref)!;
      importCitations(root, 'shared_note', noteId);
    }
  }

  function importSourceDetails(root: GedNode, sourceId: number) {
    let order = 0;
    for (const repo of findChildren(root, 'REPO')) {
      const repoId = repositoryXrefs.get(repo.value ?? '');
      if (repoId === undefined) continue;
      lines.use(repo);
      sql.insertSourceRepository.run(sourceId, repoId, order++);
    }
    importNotes(root, 'source', sourceId);
  }

  // Notes, written out or pointing at a shared note, each with its own
  // citations when it's written out.
  function importNotes(node: GedNode, owner: NoteOwner, ownerId: number) {
    let order = 0;
    const notes = node.children.filter(
      (c) => c.tag === 'NOTE' || c.tag === 'SNOTE'
    );
    for (const note of notes) {
      const shared = isPointer(note.value)
        ? sharedNoteXrefs.get(note.value!)
        : null;
      if (shared === undefined) continue;
      lines.use(note);
      if (shared === null && isEmptyLine(note)) continue;
      const res = sql.insertNote.run(
        owner,
        ownerId,
        shared === null ? (note.value ?? '') : null,
        shared,
        order++
      );
      if (shared === null) {
        importCitations(note, 'note', Number(res.lastInsertRowid));
      }
      stats.notes += 1;
    }
  }

  function importName(name: GedNode, personId: number, order: number) {
    const full = name.value ?? '';
    const parts = parseName(full);
    const res = sql.insertName.run(
      personId,
      full,
      parts.given,
      parts.surname,
      parts.suffix,
      enumValue(take(name, 'TYPE')),
      order
    );
    const nameId = Number(res.lastInsertRowid);
    let pieceOrder = 0;
    for (const piece of name.children) {
      if (!NAME_PIECE_TAGS.includes(piece.tag)) continue;
      lines.use(piece);
      if (isEmptyLine(piece)) continue;
      sql.insertNamePiece.run(
        nameId,
        piece.tag,
        piece.value ?? '',
        pieceOrder++
      );
    }
    importNotes(name, 'name', nameId);
    importCitations(name, 'name', nameId);
    stats.names += 1;
  }

  // GEDCOM 7 requires an association's ROLE; a bare OTHER says nothing.
  function relationOf(role: GedNode | undefined) {
    const value = enumValue(role);
    return value === 'OTHER' ? null : value;
  }

  function importAssociations(root: GedNode, personId: number) {
    let order = 0;
    for (const asso of findChildren(root, 'ASSO')) {
      const associateId = personXrefs.get(asso.value ?? '');
      if (associateId === undefined) continue;
      lines.use(asso);
      const res = sql.insertAssociation.run(
        personId,
        associateId,
        takeValue(asso, 'RELA') ?? relationOf(take(asso, 'ROLE')),
        order++
      );
      importNotes(asso, 'association', Number(res.lastInsertRowid));
    }
  }

  function importPersonDetails(root: GedNode, personId: number): void {
    let nameOrder = 0;
    for (const name of takeAll(root, 'NAME')) {
      if (!isEmptyLine(name)) importName(name, personId, nameOrder++);
    }
    importFacts(root, 'person', personId, PERSON_FACT_TAGS);

    // A person's families are read from the FAM records' HUSB, WIFE and
    // CHIL, so these pointers back say nothing more.
    takeAll(root, 'FAMC');
    takeAll(root, 'FAMS');
    // RIN repeats the record's xref.
    takeAll(root, 'RIN');

    importAssociations(root, personId);
    importNotes(root, 'person', personId);
    importCitations(root, 'person', personId);
    importMediaLinks(root, 'person', personId);
  }

  function resolveParentId(xref: string | null) {
    if (xref === null) return null;
    return personXrefs.get(xref) ?? null;
  }

  function importFamilyDetails(root: GedNode, familyId: number): void {
    const husbandId = resolveParentId(takeValue(root, 'HUSB'));
    const wifeId = resolveParentId(takeValue(root, 'WIFE'));
    sql.updateFamily.run(husbandId, wifeId, familyId);

    let childOrder = 0;
    for (const ch of takeAll(root, 'CHIL')) {
      const childId = personXrefs.get(ch.value ?? '');
      if (childId === undefined) continue;
      const res = sql.insertFamilyChild.run(familyId, childId, childOrder);
      if (res.changes === 0) continue;
      childOrder += 1;
      stats.familyChildren += 1;
    }

    importFacts(root, 'family', familyId, FAMILY_FACT_TAGS);
    takeAll(root, 'RIN');
    importNotes(root, 'family', familyId);
    importCitations(root, 'family', familyId);
    importMediaLinks(root, 'family', familyId);
  }

  // A citation either points to a source record (`SOUR @S1@`) or describes
  // its source inline (`SOUR <text>`); the inline text stands in for DATA/TEXT
  // when there is none.
  function readCitation(sour: GedNode) {
    const pointer = isPointer(sour.value);
    const data = take(sour, 'DATA');
    const event = take(sour, 'EVEN');
    return {
      sourceId: pointer ? (sourceXrefs.get(sour.value!) ?? null) : null,
      page: takeValue(sour, 'PAGE'),
      event: enumValue(event),
      role: enumValue(event === undefined ? undefined : take(event, 'ROLE')),
      quality: gedcom7Quality(toInt(takeValue(sour, 'QUAY') ?? undefined)),
      dataDate: gedcom7Date(takeValue(data, 'DATE')),
      text: takeValue(data, 'TEXT') ?? (pointer ? null : (sour.value ?? null))
    };
  }

  function importCitations(
    holder: GedNode,
    scope: CitationScope,
    scopeId: number
  ) {
    takeAll(holder, 'SOUR').forEach((sour, i) => {
      const extras = readLink(sour);
      const c = readCitation(sour);
      const res = sql.insertCitation.run(
        scope,
        scopeId,
        c.sourceId,
        c.page,
        c.event,
        c.role,
        c.quality,
        c.dataDate,
        c.text,
        i,
        ...linkValues(extras)
      );
      const citationId = Number(res.lastInsertRowid);
      importNotes(sour, 'citation', citationId);
      importMediaLinks(sour, 'citation', citationId);
      stats.citations += 1;
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
    const lines = [text, ...parts].filter(
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
    const res = sql.insertFact.run(
      owner.scope,
      owner.id,
      node.tag,
      takeValue(node, 'TYPE'),
      gedcom7Date(takeValue(node, 'DATE')),
      place.name,
      place.latitude,
      place.longitude,
      address?.shown ?? null,
      gedcom7Age(takeValue(node, 'AGE')),
      takeValue(node, 'CAUS'),
      takeValue(node, 'AGNC'),
      value,
      order
    );
    const factId = Number(res.lastInsertRowid);
    if (address !== null) {
      sql.insertAddress.run('fact', factId, address.text, ...address.parts);
    }
    if (place.plac !== undefined) importNotes(place.plac, 'place', factId);
    importNotes(node, 'fact', factId);
    importCitations(node, 'fact', factId);
    importMediaLinks(node, 'fact', factId);
    stats.facts += 1;
  }

  const tx = db.transaction(() => {
    for (const root of roots) createRecord(root);
    for (const root of roots) populateRecord(root);
  });

  tx();
  stats.unstored = lines.unstored(roots);
  return stats;
}
