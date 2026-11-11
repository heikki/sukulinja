import { expect, test } from 'bun:test';

import type { Link, VolumeCitation } from '@/common/types';

import { citingImage } from './cite';

function row(personId: number, link: Link): VolumeCitation {
  return {
    personId,
    citation: {
      id: personId,
      source: null,
      reference: null,
      entry: null,
      page: null,
      url: null,
      record: null,
      text: null,
      churchBook: true,
      madeInApp: false,
      deletable: false,
      markKey: `citation ${personId}`,
      citedPage: null,
      cited: null
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
