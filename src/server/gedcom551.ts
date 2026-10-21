// A dataset as GEDCOM 5.5.1, for uploading to MyHeritage (ADR-0013): the
// GEDCOM 7 export's lines, written back the 5.5.1 way. No photos; an
// Astia link keeps its OBJE but not its Box, as 5.5.1 has no crop; `UID`
// is `_UID`, which is where 5.5.1 programs keep it.

import type { Database } from 'bun:sqlite';

import { ADDED_IN_APP } from './astia-links';
import { gedcomTree } from './gedcom-export';
import { line, pointer } from './gedcom-writer';
import type { OutLine } from './gedcom-writer';
import { CALENDARS, languageName } from './gedcom7-values';
import { writeGedcom551 } from './gedcom551-writer';

// The 5.5.1 FORM of a MIME type: `image/jpeg` is `jpg`.
const FORMS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
  'image/tiff': 'tif',
  'audio/wav': 'wav'
};

function formOf(mime: string) {
  return FORMS[mime] ?? mime.slice(mime.indexOf('/') + 1);
}

function dateOf(date: string) {
  let out = date;
  for (const [escape, word] of CALENDARS) {
    out = out.replaceAll(new RegExp(`\\b${word}\\b`, 'gu'), escape);
  }
  return out;
}

// A citation with no source record (`SOUR @VOID@`) is 5.5.1's inline one,
// its text the citation's value.
function inline(children: OutLine[]): OutLine {
  const data = children.find((c) => c.tag === 'DATA');
  const text = data?.children.find((c) => c.tag === 'TEXT');
  const rest = children.flatMap((c) => {
    if (c !== data) return [c];
    const kept = c.children.filter((d) => d !== text);
    return kept.length === 0 ? [] : [{ ...c, children: kept }];
  });
  return line('SOUR', text?.value ?? '', rest);
}

// What 5.5.1 calls a line GEDCOM 7 writes as `tag` under `parent`.
function tagOf(tag: string, parent: string | null) {
  if (tag === 'ROLE' && parent === 'ASSO') return 'RELA';
  if (tag === 'SNOTE') return 'NOTE';
  if (tag === 'UID') return '_UID';
  return tag;
}

// Converts GEDCOM 7 lines to 5.5.1, counting what it leaves out or
// changes. `photos` are the OBJE records of photos, which aren't written.
function converter(photos: Set<string>) {
  const counts = { photos: 0, boxes: 0, sexes: 0 };

  // An enumeration's PHRASE is 5.5.1's free text; DATE, FORM and SEX take
  // 5.5.1's values.
  function valueOf(node: OutLine, parent: string | null) {
    const phrase = node.children.find((n) => n.tag === 'PHRASE')?.value;
    const value = phrase ?? node.value;
    if (value === undefined) return value;
    if (node.tag === 'DATE') return dateOf(value);
    if (node.tag === 'FORM' && parent === 'FILE') return formOf(value);
    if (node.tag === 'SEX' && value === 'X') {
      counts.sexes += 1;
      return 'U';
    }
    return value;
  }

  function isLeftOut(node: OutLine, parent: string | null) {
    if (node.tag === 'OBJE' && photos.has(node.value ?? '')) {
      counts.photos += 1;
      return true;
    }
    if (node.tag === 'CROP') {
      counts.boxes += 1;
      return true;
    }
    // A citation made in the app that MyHeritage gives back is its own.
    return (
      node.tag === 'NOTE' && parent === 'SOUR' && node.value === ADDED_IN_APP
    );
  }

  function convert(node: OutLine, parent: string | null): OutLine[] {
    if (isLeftOut(node, parent)) return [];
    const children = node.children
      .filter((n) => n.tag !== 'PHRASE')
      .flatMap((n) => convert(n, node.tag));
    if (node.tag === 'SOUR' && node.value === '@VOID@') {
      return [inline(children)];
    }
    const out: OutLine = { ...node, tag: tagOf(node.tag, parent), children };
    const value = valueOf(node, parent);
    if (value === undefined) delete out.value;
    else out.value = value;
    return [out];
  }

  return { convert, counts };
}

function freeXref(records: OutLine[]) {
  const taken = new Set(records.map((r) => r.xref));
  for (let n = 1; ; n += 1) {
    if (!taken.has(`@U${n}@`)) return `@U${n}@`;
  }
}

// 5.5.1's header, which requires a submitter: one is added when the
// dataset has none.
function headerOf(head: OutLine, records: OutLine[]) {
  function child(tag: string) {
    return head.children.filter((c) => c.tag === tag);
  }
  const subm = child('SUBM');
  const added: OutLine[] = [];
  if (subm.length === 0) {
    const xref = freeXref(records);
    subm.push(pointer('SUBM', xref));
    added.push({ tag: 'SUBM', xref, children: [line('NAME', 'Sukulinja')] });
  }
  const header = line('HEAD', null, [
    ...child('SOUR'),
    ...subm,
    ...child('COPR'),
    line('GEDC', null, [line('VERS', '5.5.1'), line('FORM', 'LINEAGE-LINKED')]),
    line('CHAR', 'UTF-8'),
    ...child('LANG').map((l) => line('LANG', languageName(l.value ?? ''))),
    ...child('PLAC'),
    ...child('NOTE')
  ]);
  return { header, added };
}

function leftOutLines(
  counts: { photos: number; boxes: number; sexes: number },
  long: string[]
) {
  return [
    ...(counts.photos === 0 ? [] : [`${counts.photos} photo links`]),
    ...(counts.boxes === 0
      ? []
      : [`${counts.boxes} Boxes, as 5.5.1 has no crop`]),
    ...(counts.sexes === 0
      ? []
      : [`${counts.sexes} people of sex X, written as U`]),
    ...long.map((tag) => `a ${tag} longer than a 5.5.1 line, written whole`)
  ];
}

// The text, and what it leaves out or changes, worded for the export's
// note.
export function exportGedcom551(db: Database) {
  const tree = gedcomTree(db);
  const { convert, counts } = converter(
    new Set(tree.photos.map((r) => r.xref!))
  );
  const records = [...tree.records, ...tree.images].flatMap((r) =>
    convert(r, null)
  );
  const { header, added } = headerOf(tree.header, records);
  const { text, long } = writeGedcom551([
    header,
    ...records,
    ...added,
    line('TRLR')
  ]);
  return { text, left: leftOutLines(counts, long) };
}
