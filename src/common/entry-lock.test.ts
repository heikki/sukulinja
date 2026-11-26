import { expect, test } from 'bun:test';

import { changesLock } from './entry-lock';

const baptism = {
  event: 'CHR' as const,
  people: [
    { personId: 1, role: 'CHIL' },
    { personId: 2, role: 'MOTH' }
  ]
};

test('a kind chosen stays; an empty one is chosen as an edit', () => {
  expect(changesLock(baptism, { ...baptism, event: 'BURI' })).toBe(true);
  const none = { event: null, people: baptism.people };
  expect(changesLock(none, baptism)).toBe(false);
});

test("a baptism's child stays; its parents change as an edit", () => {
  const others = [
    { personId: 1, role: 'CHIL' },
    { personId: 3, role: 'FATH' }
  ];
  expect(changesLock(baptism, { ...baptism, people: others })).toBe(false);
  const swapped = [
    { personId: 2, role: 'CHIL' },
    { personId: 1, role: 'FATH' }
  ];
  expect(changesLock(baptism, { ...baptism, people: swapped })).toBe(true);
  // Taken out, the child is changed too.
  const motherOnly = [{ personId: 2, role: 'MOTH' }];
  expect(changesLock(baptism, { ...baptism, people: motherOnly })).toBe(true);
  // One with no child is given one as an edit.
  const noChild = { event: 'CHR' as const, people: motherOnly };
  expect(changesLock(noChild, baptism)).toBe(false);
});

test("a marriage's groom and bride stay; a bride is added as an edit", () => {
  const groom = {
    event: 'MARR' as const,
    people: [{ personId: 1, role: 'HUSB' }]
  };
  const both = {
    event: 'MARR' as const,
    people: [
      { personId: 1, role: 'HUSB' },
      { personId: 2, role: 'WIFE' }
    ]
  };
  expect(changesLock(groom, both)).toBe(false);
  const another = {
    event: 'MARR' as const,
    people: [
      { personId: 1, role: 'HUSB' },
      { personId: 3, role: 'WIFE' }
    ]
  };
  expect(changesLock(both, another)).toBe(true);
});

test("a burial's one person stays", () => {
  const burial = {
    event: 'BURI' as const,
    people: [{ personId: 1, role: null }]
  };
  expect(changesLock(burial, burial)).toBe(false);
  expect(
    changesLock(burial, { ...burial, people: [{ personId: 2, role: null }] })
  ).toBe(true);
});
