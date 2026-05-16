import type { Database } from 'bun:sqlite';

import type { Scope } from '@common/types';

import {
  childValue,
  findChild,
  findChildren,
  type GedNode
} from './gedcom-parser';

const PERSON_FACT_TAGS = new Set([
  'BIRT',
  'CHR',
  'BAPM',
  'DEAT',
  'BURI',
  'CREM',
  'ADOP',
  'CONF',
  'ORDN',
  'EVEN',
  'OCCU',
  'RESI',
  'EDUC',
  'NATI',
  'IMMI',
  'EMIG',
  'NATU',
  'GRAD',
  'RETI'
]);

const FAMILY_FACT_TAGS = new Set([
  'MARR',
  'DIV',
  'ENGA',
  'ANUL',
  'MARB',
  'MARC',
  'MARL',
  'MARS',
  'EVEN'
]);

const NAME_RE = /^(?<given>[^/]*)\/(?<surname>[^/]*)\/(?<suffix>.*)$/;

export interface ImportStats {
  persons: number;
  families: number;
  names: number;
  facts: number;
  media: number;
  mediaLinks: number;
  familyChildren: number;
}

interface NameParts {
  given: string | null;
  surname: string | null;
  suffix: string | null;
}

interface CropValues {
  top: number | null;
  left: number | null;
  width: number | null;
  height: number | null;
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

function cropValues(file: GedNode): CropValues {
  const crop = findChild(file, 'CROP');
  if (crop === undefined) {
    return { top: null, left: null, width: null, height: null };
  }
  return {
    top: toInt(findChild(crop, 'TOP')?.value),
    left: toInt(findChild(crop, 'LEFT')?.value),
    width: toInt(findChild(crop, 'WIDTH')?.value),
    height: toInt(findChild(crop, 'HEIGHT')?.value)
  };
}

function isPrimaryFlag(obje: GedNode): number {
  return findChild(obje, '_PRIM')?.value === 'Y' ? 1 : 0;
}

export function importGedcom(db: Database, roots: GedNode[]): ImportStats {
  const personXrefs = new Map<string, number>();
  const familyXrefs = new Map<string, number>();
  const stats: ImportStats = {
    persons: 0,
    families: 0,
    names: 0,
    facts: 0,
    media: 0,
    mediaLinks: 0,
    familyChildren: 0
  };

  const insertPerson = db.prepare(
    'INSERT INTO persons (xref, sex) VALUES (?, ?)'
  );
  const insertFamily = db.prepare(
    'INSERT INTO families (xref, husband_id, wife_id) VALUES (?, NULL, NULL)'
  );
  const updateFamily = db.prepare(
    'UPDATE families SET husband_id = ?, wife_id = ? WHERE id = ?'
  );
  const insertName = db.prepare(
    'INSERT INTO names (person_id, full_text, given, surname, suffix, name_type, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  const insertFact = db.prepare(
    'INSERT INTO facts (scope_type, scope_id, tag, date_text, place, value, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  const insertFamilyChild = db.prepare(
    'INSERT INTO family_children (family_id, person_id, sort_order) VALUES (?, ?, ?)'
  );
  const getMediaByPath = db.prepare('SELECT id FROM media WHERE file_path = ?');
  const insertMedia = db.prepare(
    'INSERT INTO media (file_path, format) VALUES (?, ?) RETURNING id'
  );
  const insertMediaLink = db.prepare(
    'INSERT INTO media_links (media_id, scope_type, scope_id, is_primary, title, crop_top, crop_left, crop_width, crop_height, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );

  function createRecord(root: GedNode): void {
    if (!hasXref(root)) return;
    if (root.tag === 'INDI') {
      const res = insertPerson.run(root.xref, childValue(root, 'SEX'));
      personXrefs.set(root.xref, Number(res.lastInsertRowid));
      stats.persons += 1;
    } else if (root.tag === 'FAM') {
      const res = insertFamily.run(root.xref);
      familyXrefs.set(root.xref, Number(res.lastInsertRowid));
      stats.families += 1;
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

  function importPersonName(
    name: GedNode,
    personId: number,
    sortOrder: number
  ): void {
    const full = name.value ?? '';
    const parts = parseName(full);
    insertName.run(
      personId,
      full,
      parts.given,
      parts.surname,
      parts.suffix,
      childValue(name, 'TYPE'),
      sortOrder
    );
    stats.names += 1;
  }

  function importPersonDetails(root: GedNode, personId: number): void {
    findChildren(root, 'NAME').forEach((name, i) => {
      importPersonName(name, personId, i);
    });

    let factOrder = 0;
    for (const child of root.children) {
      if (PERSON_FACT_TAGS.has(child.tag)) {
        insertFactRow('person', personId, child, factOrder++);
      }
    }

    let mediaOrder = 0;
    for (const obje of findChildren(root, 'OBJE')) {
      importMediaLink(obje, 'person', personId, mediaOrder++);
    }
  }

  function resolveParentId(xref: string | undefined): number | null {
    if (xref === undefined) return null;
    return personXrefs.get(xref) ?? null;
  }

  function importFamilyChild(
    ch: GedNode,
    familyId: number,
    sortOrder: number
  ): void {
    const xref = ch.value;
    if (xref === undefined) return;
    const childId = personXrefs.get(xref);
    if (childId === undefined) return;
    insertFamilyChild.run(familyId, childId, sortOrder);
    stats.familyChildren += 1;
  }

  function importFamilyDetails(root: GedNode, familyId: number): void {
    const husbandId = resolveParentId(findChild(root, 'HUSB')?.value);
    const wifeId = resolveParentId(findChild(root, 'WIFE')?.value);
    updateFamily.run(husbandId, wifeId, familyId);

    findChildren(root, 'CHIL').forEach((ch, i) => {
      importFamilyChild(ch, familyId, i);
    });

    let factOrder = 0;
    for (const child of root.children) {
      if (FAMILY_FACT_TAGS.has(child.tag)) {
        insertFactRow('family', familyId, child, factOrder++);
      }
    }
  }

  function insertFactRow(
    scope: Scope,
    scopeId: number,
    node: GedNode,
    order: number
  ): void {
    insertFact.run(
      scope,
      scopeId,
      node.tag,
      childValue(node, 'DATE'),
      childValue(node, 'PLAC'),
      node.value ?? null,
      order
    );
    stats.facts += 1;
  }

  function resolveMediaId(path: string, format: string | null): number {
    const existing = getMediaByPath.get(path) as { id: number } | null;
    if (existing !== null) return existing.id;
    const res = insertMedia.get(path, format) as { id: number };
    stats.media += 1;
    return res.id;
  }

  function importMediaLink(
    obje: GedNode,
    scope: Scope,
    scopeId: number,
    order: number
  ): void {
    const file = findChild(obje, 'FILE');
    if (file === undefined) return;
    const path = file.value;
    if (path === undefined || path === '') return;
    const mediaId = resolveMediaId(path, childValue(file, 'FORM'));

    const crop = cropValues(file);
    insertMediaLink.run(
      mediaId,
      scope,
      scopeId,
      isPrimaryFlag(obje),
      childValue(obje, 'TITL'),
      crop.top,
      crop.left,
      crop.width,
      crop.height,
      order
    );
    stats.mediaLinks += 1;
  }

  const tx = db.transaction(() => {
    for (const root of roots) createRecord(root);
    for (const root of roots) populateRecord(root);
  });

  tx();
  return stats;
}
