// What a new Entry likely records (ADR-0033): the Entry before it in the
// Volume, else its Book.

import { expect, test } from 'bun:test';

import { bookEvent, firstGuess } from '@/common/entry-events';
import type { EntryEvent } from '@/common/entry-events';
import type { VolumeCitation } from '@/common/types';

const BAPTISMS = 'I C:3 Syntyneiden ja kastettujen luettelot (1790-1810)';

// A Citation of an Entry of the Event, at the Box's top on the Image.
function entry(
  event: EntryEvent | null,
  image: number,
  top: number
): VolumeCitation {
  return {
    personId: 1,
    citation: {
      id: 1,
      source: null,
      reference: null,
      entry: null,
      page: null,
      record: null,
      text: null,
      churchBook: true,
      madeInApp: true,
      markKey: 'entry 1',
      citedPage: null,
      cited: null,
      supports: [],
      entryId: 1,
      event,
      role: null
    },
    link: {
      volumeId: 'v',
      volume: BAPTISMS,
      url: '',
      precision: 'entry',
      image,
      box: { left: 0, top, width: 100, height: 20 },
      certainty: 'marked'
    }
  };
}

const AT = { image: 5, box: { left: 0, top: 300, width: 100, height: 20 } };

test('the Book gives the first guess, a burial book too', () => {
  expect(bookEvent(BAPTISMS)).toBe('CHR');
  expect(bookEvent('I Ea:1 Vihittyjen luettelot (1790-1810)')).toBe('MARR');
  expect(
    bookEvent('I F:2 Kuolleiden ja haudattujen luettelot (1790-1810)')
  ).toBe('BURI');
  expect(bookEvent('I Aa:5 Pää- ja rippikirjat (1790-1796)')).toBe('RESI');
  expect(bookEvent('I Ab:1 Lastenkirjat (1790-1796)')).toBe('RESI');
  expect(bookEvent('II Muut asiakirjat')).toBeNull();
  expect(firstGuess(BAPTISMS, [], AT)).toBe('CHR');
  expect(firstGuess('II Muut asiakirjat', [], AT)).toBeNull();
});

test('the Entry before it in the Volume guesses first: above it, else on an earlier Image', () => {
  const rows = [
    entry('MARR', 3, 100),
    entry('BURI', 4, 50),
    entry('RESI', 4, 10),
    // Below it, or on a later Image: not before it.
    entry('RESI', 5, 400),
    entry('RESI', 6, 10)
  ];
  expect(firstGuess(BAPTISMS, rows, AT)).toBe('BURI');
  expect(firstGuess(BAPTISMS, [...rows, entry('MARR', 5, 200)], AT)).toBe(
    'MARR'
  );
  // One whose Event isn't known says nothing.
  expect(firstGuess(BAPTISMS, [entry(null, 5, 200)], AT)).toBe('CHR');
});
