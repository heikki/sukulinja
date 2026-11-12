import { expect, test } from 'bun:test';

import type { Change, ChangeWhat, PersonRow } from '@/common/types';

import {
  byDay,
  detailOf,
  doneLabel,
  leadsTo,
  whereLabel,
  whoseLabel
} from './helpers';

const MATTI: PersonRow = {
  id: 1,
  given: 'Matti',
  surname: 'Testinen',
  sex: 'M',
  birth_year: 1770,
  death_year: 1820,
  birth_date: null,
  death_date: null,
  died: true,
  photo_path: null,
  crop: null
};
const PERSONS = new Map([[1, MATTI]]);

const MARK: ChangeWhat = {
  kind: 'mark',
  at: 'image',
  volume: 'I Aa:5',
  image: 232,
  confirmed: false,
  moved: false,
  citations: 1,
  pagePin: null
};

function change(what: ChangeWhat, extra: Partial<Change> = {}): Change {
  return {
    id: 1,
    at: '2026-11-09T12:00:00',
    what,
    on: null,
    who: null,
    ...extra
  };
}

test('says what each was', () => {
  expect(doneLabel(MARK)).toBe('Marked the Image');
  expect(doneLabel({ ...MARK, at: 'entry' })).toBe('Marked the entry');
  expect(doneLabel({ ...MARK, at: 'volume', image: null })).toBe(
    'Marked the Volume'
  );
  expect(doneLabel({ ...MARK, at: 'entry', confirmed: true })).toBe(
    'Confirmed the Match'
  );
  expect(doneLabel({ ...MARK, at: 'entry', moved: true })).toBe(
    'Moved the entry'
  );
  const discard = { kind: 'discard', volume: 'v', image: 1 } as const;
  expect(doneLabel({ ...discard, rejection: false })).toBe('Discarded the Box');
  expect(doneLabel({ ...discard, rejection: true })).toBe('Rejected the Match');
  const imported = { kind: 'import', file: 'tree.ged', lost: 0 } as const;
  expect(doneLabel({ ...imported, merged: false })).toBe('Imported tree.ged');
  expect(doneLabel({ ...imported, merged: true })).toBe(
    'Imported tree.ged again'
  );
});

test('says where, and what more it did', () => {
  expect(detailOf(MARK)).toBe('I Aa:5, Image 232');
  expect(detailOf({ ...MARK, citations: 3, pagePin: 463 })).toBe(
    'I Aa:5, Image 232, in 3 Citations, pinned page 463'
  );
  expect(detailOf({ ...MARK, at: 'volume', image: null })).toBe('I Aa:5');
  expect(
    detailOf({ kind: 'import', file: 'a.ged', merged: true, lost: 2 })
  ).toBe('2 not kept');
  expect(detailOf({ kind: 'undo-import' })).toBeNull();
  const switched = {
    kind: 'switch-filming',
    volume: 'I Ab:9',
    from: 455,
    to: 434
  } as const;
  expect(detailOf({ ...switched, stale: 0 })).toBe('I Ab:9, 455 → 434 Images');
  expect(detailOf({ ...switched, stale: 1 })).toBe(
    'I Ab:9, 455 → 434 Images, 1 pin left out'
  );
});

test("names whom it was on, live, or as they were named once they're gone", () => {
  const on = { kind: 'person', personId: 1 } as const;
  expect(whoseLabel(change(MARK, { on }), PERSONS)).toStartWith(
    'Matti Testinen ('
  );
  expect(whoseLabel(change(MARK, { who: 'Maija  /Esimerkki/' }), PERSONS)).toBe(
    'Maija Esimerkki'
  );
  expect(whoseLabel(change({ kind: 'undo-import' }), PERSONS)).toBeNull();
  expect(whereLabel(change(MARK, { on }), PERSONS)).toEndWith(
    ') · I Aa:5, Image 232'
  );
  expect(whereLabel(change({ kind: 'undo-import' }), PERSONS)).toBe('');
});

test('leads to what it was on, but nowhere from nothing or a stale Image', () => {
  const citation = {
    kind: 'citation',
    personId: 1,
    citationId: 11,
    source: null,
    reference: null
  } as const;
  expect(leadsTo(change(MARK, { on: citation }))).toEqual(citation);
  expect(leadsTo(change(MARK))).toBeNull();
  const photo = { kind: 'photo', personId: 1, photoId: 10 } as const;
  expect(leadsTo(change(MARK, { on: photo }))).toEqual(photo);
  const image = {
    kind: 'image',
    volumeId: '201',
    volume: 'I Aa:201',
    image: 18,
    fileId: '201-f18',
    personId: null
  } as const;
  expect(leadsTo(change(MARK, { on: { ...image, stale: true } }))).toBeNull();
});

test('runs them by day: today, yesterday, then the date', () => {
  const now = new Date('2026-11-09T18:00:00');
  function at(iso: string, id: number) {
    return change({ kind: 'undo-import' }, { id, at: iso });
  }
  const days = byDay(
    [
      at('2026-11-09T12:00:00', 4),
      at('2026-11-09T08:00:00', 3),
      at('2026-11-08T12:00:00', 2),
      at('2026-10-23T12:00:00', 1)
    ],
    now
  );
  expect(days.map((d) => [d.day, d.changes.map((c) => c.id)])).toEqual([
    ['Today', [4, 3]],
    ['Yesterday', [2]],
    ['23 Oct 2026', [1]]
  ]);
});

test('says what was done to a Fact, and what it said before and after', () => {
  function fact(
    did: 'add' | 'edit' | 'delete',
    was: string | null,
    now: string | null
  ) {
    return { kind: 'fact', did, tag: 'OCCU', was, now } as const;
  }
  expect(doneLabel(fact('add', null, 'torppari'))).toBe('Added an occupation');
  expect(doneLabel({ ...fact('add', null, '1757'), tag: 'BIRT' })).toBe(
    'Added a birth'
  );
  expect(doneLabel(fact('edit', 'torppari', 'talollinen'))).toBe(
    'Changed the occupation'
  );
  expect(detailOf(fact('edit', 'torppari', 'talollinen'))).toBe(
    'torppari → talollinen'
  );
  expect(doneLabel(fact('delete', 'torppari', null))).toBe(
    'Deleted the occupation'
  );
  expect(detailOf(fact('delete', 'torppari', null))).toBe('torppari');
  expect(detailOf(fact('add', null, null))).toBeNull();
});

test('says whose relative a person was added as', () => {
  const added = {
    kind: 'person',
    did: 'add',
    relation: 'father',
    of: 'Juho Esimerkki'
  } as const;
  expect(doneLabel(added)).toBe('Added as father');
  expect(detailOf(added)).toBe('of Juho Esimerkki');
  expect(doneLabel({ ...added, did: 'link' })).toBe('Linked as father');
  const unlinked = {
    ...added,
    did: 'unlink',
    relation: 'spouse',
    of: ''
  } as const;
  expect(doneLabel(unlinked)).toBe('Removed as spouse');
  expect(detailOf(unlinked)).toBeNull();
  const edited = {
    kind: 'person',
    did: 'edit',
    was: 'Matti Esimerkki, male',
    now: 'Matti Malli, male'
  } as const;
  expect(doneLabel(edited)).toBe('Changed the name');
  expect(detailOf(edited)).toBe('Matti Esimerkki, male → Matti Malli, male');
});
