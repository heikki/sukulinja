// Who can be named in an Entry: the rule the server and the Entry pane
// share.

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
      referenceEntry: null,
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
      event: null,
      fields: null,
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

test('an entry names someone, each once, in a Role of its Event', () => {
  const child = { personId: 1, role: 'CHIL' };
  expect(namingRefusal('CHR', [])).toBe('Name someone in it.');
  expect(namingRefusal('CHR', [child, { personId: 2, role: null }])).toBeNull();
  expect(namingRefusal('CHR', [{ personId: 1, role: 'HUSB' }])).toBe(
    "That isn't a Role in this kind of entry."
  );
  expect(namingRefusal('CHR', [child, { ...child, role: 'FATH' }])).toBe(
    'Someone is named twice.'
  );
  // A household's line has no Roles.
  expect(namingRefusal('RESI', [{ personId: 1, role: 'CHIL' }])).toBe(
    "That isn't a Role in this kind of entry."
  );
});

test('its kind is chosen, whatever the Book', () => {
  expect(namingRefusal(null, [{ personId: 1, role: null }])).toBe(
    'Choose what kind of entry it is.'
  );
});

test('a burial or a household line names one person', () => {
  const two = [
    { personId: 1, role: null },
    { personId: 2, role: null }
  ];
  expect(namingRefusal('BURI', two.slice(0, 1))).toBeNull();
  expect(namingRefusal('BURI', two)).toBe(
    'This kind of entry names one person.'
  );
  // One made before naming more keeps them, but takes no one else.
  expect(namingRefusal('RESI', two, [1, 2])).toBeNull();
  expect(namingRefusal('RESI', two, [1])).toBe(
    'This kind of entry names one person.'
  );
});
