// Who can be named in an Entry: the rule the server and the Scan viewer's
// card share.

import { expect, test } from 'bun:test';

import { citingImage, namingRefusal } from '@/common/entry-naming';
import type { Link, VolumeCitation } from '@/common/types';

function row(
  personId: number,
  link: Link,
  entryId: number | null = null
): VolumeCitation {
  return {
    personId,
    citation: {
      id: personId,
      source: null,
      reference: null,
      entry: null,
      page: null,
      record: null,
      text: null,
      churchBook: true,
      madeInApp: false,
      markKey: `citation ${personId}`,
      citedPage: null,
      cited: null,
      supports: [],
      entryId,
      role: null
    },
    link
  };
}

test('those citing the Image are the people beside it, of any certainty', () => {
  const at = { volumeId: '201', volume: 'I Aa:1', url: '' };
  const rows = [
    row(1, { ...at, precision: 'image', image: 18, certainty: 'estimated' }),
    row(2, {
      ...at,
      precision: 'entry',
      image: 18,
      box: { left: 0, top: 0, width: 10, height: 10 },
      certainty: 'match'
    }),
    row(3, { ...at, precision: 'image', image: 19, certainty: 'marked' }),
    row(4, { ...at, precision: 'volume', certainty: 'estimated' })
  ];
  expect([...citingImage(rows, 18)]).toEqual([1, 2]);
});

test("the Entry's own Citations don't keep its people out", () => {
  const at = { volumeId: '201', volume: 'I Aa:1', url: '' };
  const box = { left: 0, top: 0, width: 10, height: 10 };
  const on = {
    ...at,
    precision: 'entry',
    image: 18,
    box,
    certainty: 'marked'
  } as const;
  const rows = [row(1, on, 7), row(2, on, 8)];
  expect([...citingImage(rows, 18, 7)]).toEqual([2]);
});

test('an entry names someone, each once, in a Role of its Book', () => {
  const baptisms = 'I C:3 Syntyneiden ja kastettujen luettelot (1790-1810)';
  const child = { personId: 1, role: 'CHIL' };
  expect(namingRefusal(baptisms, [])).toBe('Name someone in it.');
  expect(
    namingRefusal(baptisms, [child, { personId: 2, role: null }])
  ).toBeNull();
  expect(namingRefusal(baptisms, [{ personId: 1, role: 'HUSB' }])).toBe(
    "That isn't a Role in this kind of entry."
  );
  expect(namingRefusal(baptisms, [child, { ...child, role: 'FATH' }])).toBe(
    'Someone is named twice.'
  );
  // A household's line has no Roles.
  expect(
    namingRefusal('I Aa:1 Pää- ja rippikirjat (1790-1796)', [
      { personId: 1, role: 'CHIL' }
    ])
  ).toBe("That isn't a Role in this kind of entry.");
});
