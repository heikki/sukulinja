import { expect, test } from 'bun:test';

import { suggestedSupport } from './suggestions';

const BIRTH = { id: 1, tag: 'BIRT', date: '8 SEP 1856', familyId: null };
const DEATH = { id: 2, tag: 'DEAT', date: null, familyId: null };
const MARRIAGE = { id: 3, tag: 'MARR', date: 'ABT 1880', familyId: 9 };

test('suggests the one Fact of each kind, saying if it agrees', () => {
  expect(
    suggestedSupport(
      [
        { tag: 'BIRT', date: '1856-09-08' },
        { tag: 'DEAT', date: '1901-03-03' },
        { tag: 'MARR', date: '1880-06' }
      ],
      [BIRTH, DEATH, MARRIAGE]
    )
  ).toEqual([
    { factId: 1, says: '8.9.1856', agrees: true },
    { factId: 2, says: '3.3.1901', agrees: true },
    { factId: 3, says: '6/1880', agrees: true }
  ]);
});

test('suggests a Fact whose date differs, as differing', () => {
  expect(
    suggestedSupport([{ tag: 'BIRT', date: '1856-08-09' }], [BIRTH])
  ).toEqual([{ factId: 1, says: '9.8.1856', agrees: false }]);
});

test('suggests nothing where there is no such Fact, or two', () => {
  const another = { ...BIRTH, id: 4, date: '1857' };
  expect(
    suggestedSupport(
      [
        { tag: 'BIRT', date: '1856-09-08' },
        { tag: 'BURI', date: '1901' }
      ],
      [BIRTH, another]
    )
  ).toEqual([]);
});

test("a Marriage is only a family's", () => {
  const own = { id: 5, tag: 'MARR', date: null, familyId: null };
  expect(suggestedSupport([{ tag: 'MARR', date: '1880' }], [own])).toEqual([]);
});
