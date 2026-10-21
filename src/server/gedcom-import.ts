import type { Database } from 'bun:sqlite';

import type { Scope } from '@common/types';

import { findChild, findChildren } from './gedcom-parser';
import type { GedNode } from './gedcom-parser';
import { mediaRefsOf } from './media-refs';
import type { MediaRef } from './media-refs';

// GEDCOM 7's individual and family events and attributes.
const PERSON_FACT_TAGS = new Set([
  'ADOP',
  'BAPM',
  'BARM',
  'BASM',
  'BIRT',
  'BLES',
  'BURI',
  'CENS',
  'CHR',
  'CHRA',
  'CONF',
  'CREM',
  'DEAT',
  'EMIG',
  'FCOM',
  'GRAD',
  'IMMI',
  'NATU',
  'ORDN',
  'PROB',
  'RETI',
  'WILL',
  'EVEN',
  'CAST',
  'DSCR',
  'EDUC',
  'IDNO',
  'NATI',
  'NCHI',
  'NMR',
  'OCCU',
  'PROP',
  'RELI',
  'RESI',
  'SSN',
  'TITL',
  'FACT'
]);

const FAMILY_FACT_TAGS = new Set([
  'ANUL',
  'CENS',
  'DIV',
  'DIVF',
  'ENGA',
  'MARB',
  'MARC',
  'MARR',
  'MARL',
  'MARS',
  'EVEN',
  'NCHI',
  'RESI',
  'FACT'
]);

const NAME_PIECE_TAGS = ['NPFX', 'GIVN', 'NICK', 'SPFX', 'SURN', 'NSFX'];

const NAME_RE = /^(?<given>[^/]*)\/(?<surname>[^/]*)\/(?<suffix>.*)$/;

// A kind of line the import couldn't store, by its path from the record
// (`INDI.BIRT.CAUS`), and how many there were.
export interface Unstored {
  path: string;
  count: number;
}

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
  // Standard lines left out; program-specific `_` lines aren't counted.
  unstored: Unstored[];
}

interface NameParts {
  given: string | null;
  surname: string | null;
  suffix: string | null;
}

function hasXref(root: GedNode): root is GedNode & { xref: string } {
  return root.xref !== undefined && root.xref !== '';
}

function nullIfEmpty(s: string): string | null {
  return s === '' ? null : s;
}

function toInt(value: string | undefined): number | null {
  if (value === undefined) return null;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

function parseName(full: string): NameParts {
  const m = NAME_RE.exec(full);
  if (m === null) {
    return { given: nullIfEmpty(full.trim()), surname: null, suffix: null };
  }
  const g = m.groups!;
  return {
    given: nullIfEmpty(g.given!.trim()),
    surname: nullIfEmpty(g.surname!.trim()),
    suffix: nullIfEmpty(g.suffix!.trim())
  };
}

const ADDRESS_PARTS = ['ADR1', 'ADR2', 'ADR3', 'CITY', 'STAE', 'POST', 'CTRY'];

const POINTER_RE = /^@[^@]+@$/;

function isPointer(value: string | undefined) {
  return POINTER_RE.test(value ?? '');
}

type MediaResolver = (originalRelpath: string) => string | null;

// Records that say nothing about the tree: the header is written afresh on
// export.
const SKIPPED_RECORDS = new Set(['HEAD', 'TRLR']);

// Every standard line not in `used`, by path. Below a line that wasn't
// stored, nothing more is counted.
function unstoredLines(roots: GedNode[], used: Set<GedNode>) {
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

// A person's or family's media, with the one marked primary first: GEDCOM 7
// takes the first as the preferred one.
function primaryFirst(refs: MediaRef[]) {
  const ordered = [
    ...refs.filter((r) => r.primary),
    ...refs.filter((r) => !r.primary)
  ];
  return ordered.map((r, order) => ({ ...r, order }));
}

export function importGedcom(
  db: Database,
  roots: GedNode[],
  mediaResolver: MediaResolver
): ImportStats {
  const personXrefs = new Map<string, number>();
  const familyXrefs = new Map<string, number>();
  const sourceXrefs = new Map<string, number>();
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
    unstored: []
  };

  // Each line stored, so that what's left can be listed.
  const used = new Set<GedNode>();
  function take(node: GedNode, tag: string) {
    const child = findChild(node, tag);
    if (child !== undefined) used.add(child);
    return child;
  }
  function takeAll(node: GedNode, tag: string) {
    const children = findChildren(node, tag);
    for (const c of children) used.add(c);
    return children;
  }
  function takeValue(node: GedNode | undefined, tag: string) {
    if (node === undefined) return null;
    return take(node, tag)?.value ?? null;
  }

  const insertPerson = db.prepare(
    'INSERT INTO persons (xref, uid, sex) VALUES (?, ?, ?)'
  );
  const insertFamily = db.prepare(
    'INSERT INTO families (xref, uid, husband_id, wife_id) VALUES (?, ?, NULL, NULL)'
  );
  const updateFamily = db.prepare(
    'UPDATE families SET husband_id = ?, wife_id = ? WHERE id = ?'
  );
  const insertName = db.prepare(
    'INSERT INTO names (person_id, full_text, given, surname, suffix, name_type, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  const insertNamePiece = db.prepare(
    'INSERT INTO name_pieces (name_id, tag, value, sort_order) VALUES (?, ?, ?, ?)'
  );
  const insertFact = db.prepare(
    'INSERT INTO facts (scope_type, scope_id, tag, type, date_text, place, address, age, cause, value, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const insertAddress = db.prepare(
    'INSERT INTO fact_addresses (fact_id, text, line1, line2, line3, city, state, postal_code, country) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const insertFamilyChild = db.prepare(
    'INSERT OR IGNORE INTO family_children (family_id, person_id, sort_order) VALUES (?, ?, ?)'
  );
  const insertSource = db.prepare(
    'INSERT INTO sources (xref, title, author, publisher, text) VALUES (?, ?, ?, ?, ?)'
  );
  const insertCitation = db.prepare(
    'INSERT INTO citations (scope_type, scope_id, source_id, page, event, role, quality, data_date, text, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const insertNote = db.prepare(
    'INSERT INTO notes (owner_type, owner_id, text, sort_order) VALUES (?, ?, ?, ?)'
  );
  const getMediaByPath = db.prepare('SELECT id FROM media WHERE file_path = ?');
  const insertMedia = db.prepare(
    'INSERT INTO media (file_path, format, original_path) VALUES (?, ?, ?) RETURNING id'
  );
  const insertMediaLink = db.prepare(
    'INSERT INTO media_links (media_id, scope_type, scope_id, title, crop_top, crop_left, crop_width, crop_height, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );

  // A record's UID, or a new one: only a UID says reliably who is who from
  // one file to the next (ADR-0013).
  function uidOf(root: GedNode) {
    return takeValue(root, 'UID') ?? crypto.randomUUID();
  }

  function createRecord(root: GedNode): void {
    if (!hasXref(root)) return;
    if (root.tag === 'INDI') {
      used.add(root);
      const res = insertPerson.run(
        root.xref,
        uidOf(root),
        takeValue(root, 'SEX')
      );
      personXrefs.set(root.xref, Number(res.lastInsertRowid));
      stats.persons += 1;
    } else if (root.tag === 'FAM') {
      used.add(root);
      const res = insertFamily.run(root.xref, uidOf(root));
      familyXrefs.set(root.xref, Number(res.lastInsertRowid));
      stats.families += 1;
    } else if (root.tag === 'SOUR') {
      used.add(root);
      const res = insertSource.run(
        root.xref,
        takeValue(root, 'TITL'),
        takeValue(root, 'AUTH'),
        takeValue(root, 'PUBL'),
        takeValue(root, 'TEXT')
      );
      const sourceId = Number(res.lastInsertRowid);
      sourceXrefs.set(root.xref, sourceId);
      importNotes(root, 'source', sourceId);
      stats.sources += 1;
    }
  }

  function populateRecord(root: GedNode): void {
    if (!hasXref(root)) return;
    if (root.tag === 'INDI') {
      const personId = personXrefs.get(root.xref)!;
      importPersonDetails(root, personId);
    } else if (root.tag === 'FAM') {
      const familyId = familyXrefs.get(root.xref)!;
      importFamilyDetails(root, familyId);
    }
  }

  // Notes written out on the line; a pointer to a shared note record isn't
  // read yet, so it's left to be listed.
  function importNotes(
    node: GedNode,
    owner: 'person' | 'family' | 'fact' | 'source' | 'citation',
    ownerId: number
  ) {
    let order = 0;
    for (const note of findChildren(node, 'NOTE')) {
      if (isPointer(note.value)) continue;
      used.add(note);
      insertNote.run(owner, ownerId, note.value ?? '', order++);
      stats.notes += 1;
    }
  }

  function importName(name: GedNode, personId: number, order: number) {
    const full = name.value ?? '';
    const parts = parseName(full);
    const res = insertName.run(
      personId,
      full,
      parts.given,
      parts.surname,
      parts.suffix,
      takeValue(name, 'TYPE'),
      order
    );
    const nameId = Number(res.lastInsertRowid);
    let pieceOrder = 0;
    for (const piece of name.children) {
      if (!NAME_PIECE_TAGS.includes(piece.tag)) continue;
      used.add(piece);
      insertNamePiece.run(nameId, piece.tag, piece.value ?? '', pieceOrder++);
    }
    stats.names += 1;
  }

  function importPersonDetails(root: GedNode, personId: number): void {
    takeAll(root, 'NAME').forEach((name, i) => {
      importName(name, personId, i);
    });

    let factOrder = 0;
    for (const child of root.children) {
      if (PERSON_FACT_TAGS.has(child.tag)) {
        insertFactRow('person', personId, child, factOrder++);
      }
    }

    // A person's families are read from the FAM records' HUSB, WIFE and
    // CHIL, so these pointers back say nothing more.
    takeAll(root, 'FAMC');
    takeAll(root, 'FAMS');
    // RIN repeats the record's xref.
    takeAll(root, 'RIN');

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
    updateFamily.run(husbandId, wifeId, familyId);

    takeAll(root, 'CHIL').forEach((ch, i) => {
      const xref = ch.value;
      if (xref === undefined) return;
      const childId = personXrefs.get(xref);
      if (childId === undefined) return;
      insertFamilyChild.run(familyId, childId, i);
      stats.familyChildren += 1;
    });

    let factOrder = 0;
    for (const child of root.children) {
      if (FAMILY_FACT_TAGS.has(child.tag)) {
        insertFactRow('family', familyId, child, factOrder++);
      }
    }
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
      event: event?.value ?? null,
      role: takeValue(event, 'ROLE'),
      quality: toInt(takeValue(sour, 'QUAY') ?? undefined),
      dataDate: takeValue(data, 'DATE'),
      text: takeValue(data, 'TEXT') ?? (pointer ? null : (sour.value ?? null))
    };
  }

  function importCitations(root: GedNode, scope: Scope, scopeId: number) {
    takeAll(root, 'SOUR').forEach((sour, i) => {
      const c = readCitation(sour);
      const res = insertCitation.run(
        scope,
        scopeId,
        c.sourceId,
        c.page,
        c.event,
        c.role,
        c.quality,
        c.dataDate,
        c.text,
        i
      );
      importNotes(sour, 'citation', Number(res.lastInsertRowid));
      stats.citations += 1;
    });
  }

  // An event's ADDR, its parts kept and its lines joined for showing.
  // MyHeritage records residences this way rather than with PLAC.
  function readAddress(node: GedNode) {
    const addr = take(node, 'ADDR');
    if (addr === undefined) return null;
    const text = addr.value ?? null;
    const parts = ADDRESS_PARTS.map((tag) => takeValue(addr, tag));
    const lines = [text, ...parts].filter(
      (x): x is string => x !== null && x.trim() !== ''
    );
    return { text, parts, shown: lines.length === 0 ? null : lines.join(', ') };
  }

  function insertFactRow(
    scope: Scope,
    scopeId: number,
    node: GedNode,
    order: number
  ): void {
    used.add(node);
    const address = readAddress(node);
    const res = insertFact.run(
      scope,
      scopeId,
      node.tag,
      takeValue(node, 'TYPE'),
      takeValue(node, 'DATE'),
      takeValue(node, 'PLAC'),
      address?.shown ?? null,
      takeValue(node, 'AGE'),
      takeValue(node, 'CAUS'),
      node.value ?? null,
      order
    );
    const factId = Number(res.lastInsertRowid);
    if (address !== null) {
      insertAddress.run(factId, address.text, ...address.parts);
    }
    importNotes(node, 'fact', factId);
    stats.facts += 1;
  }

  function resolveMediaId(
    storedPath: string,
    originalPath: string,
    format: string | null
  ): number {
    const existing = getMediaByPath.get(storedPath) as { id: number } | null;
    if (existing !== null) return existing.id;
    const res = insertMedia.get(storedPath, format, originalPath) as {
      id: number;
    };
    stats.media += 1;
    return res.id;
  }

  // A media row for the stored file, which files with the same content
  // share, and a link to it from the person or family.
  function importMediaLink(ref: MediaRef, scope: Scope, scopeId: number) {
    const storedPath = mediaResolver(ref.path);
    if (storedPath === null) return;
    const mediaId = resolveMediaId(storedPath, ref.path, ref.format);
    const { crop } = ref;
    insertMediaLink.run(
      mediaId,
      scope,
      scopeId,
      ref.title,
      crop.top,
      crop.left,
      crop.width,
      crop.height,
      ref.order
    );
    stats.mediaLinks += 1;
  }

  // The lines mediaRefsOf reads. A file that couldn't be stored is reported
  // by the media ingest, not here.
  function markMediaLines(record: GedNode) {
    for (const obje of findChildren(record, 'OBJE')) {
      if (isPointer(obje.value)) continue;
      used.add(obje);
      take(obje, 'TITL');
      for (const file of takeAll(obje, 'FILE')) {
        take(file, 'FORM');
        const crop = take(file, 'CROP');
        if (crop === undefined) continue;
        for (const side of ['TOP', 'LEFT', 'HEIGHT', 'WIDTH']) take(crop, side);
      }
    }
  }

  function importMediaLinks(root: GedNode, scope: Scope, scopeId: number) {
    markMediaLines(root);
    for (const ref of primaryFirst(mediaRefsOf(root))) {
      importMediaLink(ref, scope, scopeId);
    }
  }

  const tx = db.transaction(() => {
    for (const root of roots) createRecord(root);
    for (const root of roots) populateRecord(root);
  });

  tx();
  stats.unstored = unstoredLines(roots, used);
  return stats;
}
