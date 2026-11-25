import { expect, test } from 'bun:test';

import type {
  CitationRow,
  Link,
  PersonRow,
  StalePin,
  VolumeCitation
} from '@/common/types';

import { staleLines } from './stale-lines';

const LINK: Link = {
  url: '',
  archive: 'A',
  volumeId: 'v',
  volume: 'I Ab:9',
  precision: 'volume',
  certainty: 'estimated'
};

function row(personId: number, markKey: string, entry: string): VolumeCitation {
  const citation: CitationRow = {
    id: personId,
    source: null,
    reference: null,
    entry,
    referenceEntry: entry,
    page: null,
    record: null,
    text: null,
    churchBook: true,
    madeInApp: false,
    markKey,
    citedPage: null,
    cited: null,
    supports: [],
    entryId: null,
    event: null,
    fields: null,
    role: null
  };
  return { personId, citation, link: LINK };
}

const ROWS = [
  row(1, 'record 500', 'p. 463'),
  row(2, 'record 500', 'p. 463'),
  row(3, 'url https://mh/y?itemId=9', '3.3.1761')
];

const PERSONS = new Map<number, PersonRow>(
  [1, 2, 3].map((id) => [
    id,
    { id, given: `Person${id}`, surname: 'Esimerkki' } as unknown as PersonRow
  ])
);

test('names stale marks first, then Matches, then each Page pin once', () => {
  const stale: StalePin[] = [
    {
      kind: 'page',
      by: 'hand',
      image: 125,
      pages: [234, 235]
    },
    { kind: 'page', by: 'hand', image: 125, pages: [234, 235] },
    {
      kind: 'record',
      by: 'vision',
      image: 247,
      record: 500,
      markKey: 'record 500'
    },
    {
      kind: 'reference',
      by: 'hand',
      image: 40,
      url: 'https://mh/y?itemId=9',
      markKey: 'url https://mh/y?itemId=9'
    },
    {
      kind: 'record',
      by: 'hand',
      image: 30,
      record: 777,
      markKey: 'record 777'
    }
  ];
  expect(staleLines(stale, ROWS, PERSONS)).toEqual([
    'Mark: record 777, Image 30',
    'Mark: Person3 Esimerkki, 3.3.1761, Image 40',
    'Match: Person1 Esimerkki, p. 463; Person2 Esimerkki, p. 463, Image 247',
    'Page pin: pp. 234–235, Image 125'
  ]);
});
