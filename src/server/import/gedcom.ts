import type { Database } from 'bun:sqlite';

import type { Scope } from '@/common/types';

import { openAnnotations } from '../citations';
import { objectRecords } from '../gedcom/media-refs';
import { parseName } from '../gedcom/names';
import { findChildren } from '../gedcom/parser';
import type { GedNode } from '../gedcom/parser';
import {
  FAMILY_FACT_TAGS,
  HEADER_META,
  NAME_PIECE_TAGS,
  PERSON_FACT_TAGS
} from '../gedcom/tags';
import { gedcom7Date, gedcom7Quality, languageTag } from '../gedcom/values';
import { factImporter } from './facts';
import { annotationReader } from './links';
import { mediaLinker } from './media';
import type { MediaResolver } from './media';
import { importStatements } from './statements';
import { isEmptyLine, lineReader } from './unstored';
import type { Unstored } from './unstored';

export type { Unstored } from './unstored';

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

  const { importFacts, importAddress } = factImporter({
    sql,
    lines,
    count: () => {
      stats.facts += 1;
    },
    importNotes,
    importCitations,
    importMediaLinks
  });

  const citationRows = openAnnotations(db);
  const readAnnotation = annotationReader(roots, lines);

  // A record's UID, or a new one: only a UID says reliably who is who from
  // one file to the next (ADR-0013).
  function uidOf(root: GedNode) {
    const uid = takeValue(root, 'UID');
    if (uid === null) stats.newUids += 1;
    return uid ?? crypto.randomUUID();
  }

  // When a record was last changed, as the file says, by the columns it's
  // kept in.
  function changeOf(root: GedNode) {
    const chan = take(root, 'CHAN');
    const date = chan === undefined ? undefined : take(chan, 'DATE');
    return {
      $change_date: date?.value ?? null,
      $change_time: takeValue(date, 'TIME')
    };
  }

  function importHeader(head: GedNode) {
    for (const [path, key] of HEADER_META) {
      let node: GedNode | undefined = head;
      for (const tag of path) {
        node = node === undefined ? node : take(node, tag);
      }
      if (node?.value !== undefined) {
        const value = key === 'language' ? languageTag(node.value) : node.value;
        sql.insertMeta.run({ $key: key, $value: value });
      }
    }
  }

  // The records others point at come first, so a pointer always finds its
  // target: people, families, sources, repositories and shared notes.
  function createRecord(root: GedNode): void {
    if (!hasXref(root)) return;
    if (root.tag === 'INDI') {
      lines.use(root);
      const change = changeOf(root);
      const res = sql.insertPerson.run({
        $xref: root.xref,
        $uid: uidOf(root),
        $sex: takeValue(root, 'SEX'),
        ...change
      });
      personXrefs.set(root.xref, Number(res.lastInsertRowid));
      stats.persons += 1;
    } else if (root.tag === 'FAM') {
      lines.use(root);
      const change = changeOf(root);
      const res = sql.insertFamily.run({
        $xref: root.xref,
        $uid: uidOf(root),
        ...change
      });
      familyXrefs.set(root.xref, Number(res.lastInsertRowid));
      stats.families += 1;
    } else if (root.tag === 'SOUR') {
      createSource(root);
    } else if (root.tag === 'REPO') {
      lines.use(root);
      const change = changeOf(root);
      const res = sql.insertRepository.run({
        $xref: root.xref,
        $name: takeValue(root, 'NAME'),
        $phone: takeValue(root, 'PHON'),
        ...change
      });
      const repoId = Number(res.lastInsertRowid);
      repositoryXrefs.set(root.xref, repoId);
      importAddress(root, 'repository', repoId);
    } else if (root.tag === 'NOTE' || root.tag === 'SNOTE') {
      lines.use(root);
      const change = changeOf(root);
      const res = sql.insertSharedNote.run({
        $xref: root.xref,
        $text: root.value ?? '',
        ...change
      });
      sharedNoteXrefs.set(root.xref, Number(res.lastInsertRowid));
    } else if (root.tag === 'SUBM') {
      createSubmitter(root);
    }
  }

  function createSource(root: GedNode & { xref: string }) {
    lines.use(root);
    const change = changeOf(root);
    const data = take(root, 'DATA');
    const res = sql.insertSource.run({
      $xref: root.xref,
      $title: takeValue(root, 'TITL'),
      $author: takeValue(root, 'AUTH'),
      $publisher: takeValue(root, 'PUBL'),
      $text: takeValue(root, 'TEXT'),
      $data_events: takeValue(data, 'EVEN'),
      ...change
    });
    sourceXrefs.set(root.xref, Number(res.lastInsertRowid));
    stats.sources += 1;
  }

  function createSubmitter(root: GedNode & { xref: string }) {
    lines.use(root);
    const change = changeOf(root);
    const res = sql.insertSubmitter.run({
      $xref: root.xref,
      $name: takeValue(root, 'NAME'),
      $phone: takeValue(root, 'PHON'),
      $email: takeValue(root, 'EMAIL'),
      $website: takeValue(root, 'WWW'),
      ...change
    });
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
      sql.insertSourceRepository.run({
        $source_id: sourceId,
        $repository_id: repoId,
        $sort_order: order++
      });
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
      const res = sql.insertNote.run({
        $owner_type: owner,
        $owner_id: ownerId,
        $text: shared === null ? (note.value ?? '') : null,
        $shared_note_id: shared,
        $sort_order: order++
      });
      if (shared === null) {
        importCitations(note, 'note', Number(res.lastInsertRowid));
      }
      stats.notes += 1;
    }
  }

  function importName(name: GedNode, personId: number, order: number) {
    const full = name.value ?? '';
    const parts = parseName(full);
    const res = sql.insertName.run({
      $person_id: personId,
      $full_text: full,
      $given: parts.given,
      $surname: parts.surname,
      $suffix: parts.suffix,
      $name_type: enumValue(take(name, 'TYPE')),
      $sort_order: order
    });
    const nameId = Number(res.lastInsertRowid);
    let pieceOrder = 0;
    for (const piece of name.children) {
      if (!NAME_PIECE_TAGS.includes(piece.tag)) continue;
      lines.use(piece);
      if (isEmptyLine(piece)) continue;
      sql.insertNamePiece.run({
        $name_id: nameId,
        $tag: piece.tag,
        $value: piece.value ?? '',
        $sort_order: pieceOrder++
      });
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
      const res = sql.insertAssociation.run({
        $person_id: personId,
        $associate_id: associateId,
        $relation: takeValue(asso, 'RELA') ?? relationOf(take(asso, 'ROLE')),
        $sort_order: order++
      });
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
    sql.updateFamily.run({
      $husband_id: husbandId,
      $wife_id: wifeId,
      $id: familyId
    });

    let childOrder = 0;
    for (const ch of takeAll(root, 'CHIL')) {
      const childId = personXrefs.get(ch.value ?? '');
      if (childId === undefined) continue;
      const res = sql.insertFamilyChild.run({
        $family_id: familyId,
        $person_id: childId,
        $sort_order: childOrder
      });
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
      const annotation = readAnnotation(sour);
      const c = readCitation(sour);
      const citationId = citationRows.insert(
        { scopeType: scope, scopeId, sortOrder: i, ...c },
        annotation
      );
      importNotes(sour, 'citation', citationId);
      importMediaLinks(sour, 'citation', citationId);
      stats.citations += 1;
    });
  }

  const tx = db.transaction(() => {
    for (const root of roots) createRecord(root);
    for (const root of roots) populateRecord(root);
  });

  tx();
  stats.unstored = lines.unstored(roots);
  return stats;
}
