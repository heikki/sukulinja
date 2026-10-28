import type { Database } from 'bun:sqlite';
import { beforeEach, expect, test } from 'bun:test';

import { openDb } from '../datasets/db';
import {
  annotated,
  NO_ANNOTATION,
  openAnnotations,
  originalPageSql
} from './annotations';
import type {
  Annotation,
  Annotations,
  CitationLink,
  CitationValues
} from './annotations';

const MYHERITAGE =
  'https://www.myheritage.fi/research/collection-10509/x?itemId=1';
const ASTIA =
  'https://astia.narc.fi/uusiastia/viewer/?fileId=f12&aineistoId=v1';

const ON_IMAGE: CitationLink = {
  volumeId: 'v1',
  volume: 'Juva 1790-1796',
  image: 12,
  fileId: 'f12',
  box: { left: 10, top: 20, width: 300, height: 40 },
  by: 'hand'
};

let db: Database = openDb(':memory:');
let annotations: Annotations = openAnnotations(db);

beforeEach(() => {
  db = openDb(':memory:');
  annotations = openAnnotations(db);
});

function values(page: string | null): CitationValues {
  return {
    scopeType: 'person',
    scopeId: 1,
    sourceId: null,
    sortOrder: 0,
    page,
    event: 'BIRT',
    role: null,
    quality: 3,
    dataDate: null,
    text: 'Matti'
  };
}

function cite(page: string | null, annotation?: Annotation) {
  return annotations.insert(values(page), annotation);
}

// A citation as stored: its page and its Annotation.
function stored(id: number) {
  const row = db
    .query<{ page: string | null }, [number]>(
      'SELECT * FROM citations WHERE id = ?'
    )
    .get(id)!;
  const { page, annotation } = annotated(row);
  return { page, annotation };
}

test('inserts a Citation with no Annotation, and reads it back', () => {
  const id = cite(MYHERITAGE);
  expect(stored(id)).toEqual({ page: MYHERITAGE, annotation: NO_ANNOTATION });
  expect(annotated(db.query('SELECT * FROM citations').get()!)).toMatchObject({
    event: 'BIRT',
    quality: 3,
    text: 'Matti'
  });
});

test('inserts a Citation with an Annotation as given, and reads it back', () => {
  const annotation = {
    link: { ...ON_IMAGE, by: 'vision' as const },
    originalPage: MYHERITAGE,
    madeInApp: true
  };
  const id = cite(ASTIA, annotation);
  expect(stored(id)).toEqual({ page: ASTIA, annotation });
  // The row holds no Annotation columns besides.
  const row = annotated(db.query('SELECT * FROM citations').get()!);
  expect(Object.keys(row).filter((k) => k.startsWith('link_'))).toEqual([]);
});

test('a hand Mark on an Image cites it, keeping the page as the original page', () => {
  const id = cite(MYHERITAGE);
  annotations.swap([id], ON_IMAGE);
  expect(stored(id)).toEqual({
    page: ASTIA,
    annotation: { link: ON_IMAGE, originalPage: MYHERITAGE, madeInApp: false }
  });
  // The reference is still read from the original page.
  expect(
    db.query(`SELECT ${originalPageSql()} AS page FROM citations`).get()
  ).toEqual({ page: MYHERITAGE });
  // Marking it again keeps the page it had first.
  const { box: _, ...noBox } = ON_IMAGE;
  annotations.swap([id], noBox);
  expect(stored(id)).toMatchObject({
    page: ASTIA,
    annotation: { link: noBox, originalPage: MYHERITAGE }
  });
});

test('a Match keeps the page', () => {
  const id = cite(MYHERITAGE);
  const match: CitationLink = { ...ON_IMAGE, by: 'vision' };
  annotations.swap([id], match);
  expect(stored(id)).toEqual({
    page: MYHERITAGE,
    annotation: { link: match, originalPage: null, madeInApp: false }
  });
});

test('a Discard puts the original page back and clears the link', () => {
  const id = cite(MYHERITAGE);
  annotations.swap([id], ON_IMAGE);
  annotations.swap([id], null);
  expect(stored(id)).toEqual({ page: MYHERITAGE, annotation: NO_ANNOTATION });
});

test('a Mark of only a Volume leaves the page alone', () => {
  const id = cite(MYHERITAGE);
  const volume: CitationLink = { volumeId: 'v2', volume: 'I Ab:1', by: 'hand' };
  annotations.swap([id], volume);
  expect(stored(id)).toEqual({
    page: MYHERITAGE,
    annotation: { link: volume, originalPage: null, madeInApp: false }
  });
});

test('reads the first link of some Citations, and every linked one', () => {
  const [a, b, c] = [cite(MYHERITAGE), cite(MYHERITAGE), cite(MYHERITAGE)];
  annotations.swap([b, c], ON_IMAGE);
  expect(annotations.firstLink([a, c])).toEqual(ON_IMAGE);
  expect(annotations.firstLink([a])).toBeNull();
  expect(annotations.linked()).toEqual([
    { id: b, link: ON_IMAGE },
    { id: c, link: ON_IMAGE }
  ]);
});

test('carries a stored Annotation verbatim, keeping the new row made in the app or not', () => {
  const was = cite(MYHERITAGE);
  annotations.swap([was], ON_IMAGE);
  const fresh = cite(MYHERITAGE, { ...NO_ANNOTATION, madeInApp: true });
  annotations.carry(fresh, stored(was));
  expect(stored(fresh)).toEqual({
    page: ASTIA,
    annotation: { link: ON_IMAGE, originalPage: MYHERITAGE, madeInApp: true }
  });
});

test('carries a Mark through a round trip via MyHeritage, whose export gives the Astia address', () => {
  const was = cite(MYHERITAGE);
  annotations.swap([was], ON_IMAGE);
  // The new export's PAGE is already the Astia address. Working the Mark
  // out again from it would lose the MyHeritage URL.
  const fresh = cite(ASTIA);
  annotations.carry(fresh, stored(was));
  expect(stored(fresh)).toEqual({
    page: ASTIA,
    annotation: { link: ON_IMAGE, originalPage: MYHERITAGE, madeInApp: false }
  });
});
