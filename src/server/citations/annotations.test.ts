import type { Database } from 'bun:sqlite';
import { beforeEach, expect, test } from 'bun:test';

import { openDb } from '../datasets/db';
import { annotated, NO_ANNOTATION, openAnnotations } from './annotations';
import type {
  Annotation,
  Annotations,
  CitationLink,
  CitationValues
} from './annotations';

const MYHERITAGE =
  'https://www.myheritage.fi/research/collection-10509/x?itemId=1';
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
  const annotation = { link: { ...ON_IMAGE, by: 'vision' as const } };
  const id = cite(MYHERITAGE, annotation);
  expect(stored(id)).toEqual({ page: MYHERITAGE, annotation });
  // The row holds no Annotation columns besides.
  const row = annotated(db.query('SELECT * FROM citations').get()!);
  expect(Object.keys(row).filter((k) => k.startsWith('link_'))).toEqual([]);
});

test('a hand Mark on an Image links it, and the page stays the reference', () => {
  const id = cite(MYHERITAGE);
  annotations.swap([id], ON_IMAGE);
  expect(stored(id)).toEqual({
    page: MYHERITAGE,
    annotation: { link: ON_IMAGE }
  });
  const { box: _, ...noBox } = ON_IMAGE;
  annotations.swap([id], noBox);
  expect(stored(id)).toEqual({
    page: MYHERITAGE,
    annotation: { link: noBox }
  });
});

test('a Discard clears the link', () => {
  const id = cite(MYHERITAGE);
  annotations.swap([id], ON_IMAGE);
  annotations.swap([id], null);
  expect(stored(id)).toEqual({ page: MYHERITAGE, annotation: NO_ANNOTATION });
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
