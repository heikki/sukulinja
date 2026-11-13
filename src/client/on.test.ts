import { expect, test } from 'bun:test';

import { memoryDatasetApi } from '@/client/dataset-api/memory';
import { openAppState } from '@/client/state';
import type { CitationRow, Link, On, PersonRow } from '@/common/types';

import { goTo, isStale, onLabel } from './on';

const IMAGE: On = {
  kind: 'image',
  volumeId: '201',
  volume: 'I Aa:201',
  image: 18,
  fileId: '201-f18',
  stale: false,
  personId: null
};
const CITATION: On = {
  kind: 'citation',
  personId: 1,
  citationId: 11,
  source: 'Juvan seurakunnan arkisto',
  reference: 'I Aa:201, s. 18'
};

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

test('names what each is on', () => {
  const person = onLabel({ kind: 'person', personId: 1 }, PERSONS);
  expect(person).toStartWith('Matti Testinen (');
  expect(onLabel(CITATION, PERSONS)).toEndWith(' — I Aa:201, s. 18');
  expect(onLabel(IMAGE, PERSONS)).toBe('I Aa:201, Image 18');
});

test('an Image from an earlier filming is stale', () => {
  expect(isStale(IMAGE)).toBe(false);
  expect(isStale({ ...IMAGE, stale: true })).toBe(true);
  expect(isStale(CITATION)).toBe(false);
});

const C11: CitationRow = {
  id: 11,
  source: null,
  reference: null,
  entry: null,
  page: null,
  record: null,
  text: null,
  churchBook: true,
  madeInApp: false,
  markKey: 'citation 11',
  citedPage: null,
  cited: null,
  supports: [],
  transcribed: []
};
const L11: Link = {
  volumeId: '201',
  volume: 'I Aa:201',
  url: '',
  precision: 'image',
  image: 18,
  certainty: 'estimated'
};

function appState() {
  return openAppState(
    memoryDatasetApi({
      details: {
        1: {
          id: 1,
          name: 'Person 1',
          sex: 'U',
          facts: [],
          marriages: [],
          citations: [C11],
          photos: []
        }
      },
      links: { 1: [{ citationId: 11, links: [L11] }] },
      volumes: { '201': { images: 40, citations: [] } }
    })
  );
}

test("a Citation's selects its person and opens its scan", async () => {
  const state = appState();
  goTo(state, CITATION);
  await Bun.sleep(0);
  expect(state.selected.id.get()).toBe(1);
  expect(state.viewer.source.get()).toEqual({ citation: C11, link: L11 });
});

test("an Image's opens the Scan viewer there; a stale one doesn't", () => {
  const state = appState();
  goTo(state, { ...IMAGE, stale: true });
  expect(state.viewer.opened.get()).toBe(null);
  goTo(state, IMAGE);
  expect(state.viewer.opened.get()).toEqual({
    volumeId: '201',
    volume: 'I Aa:201',
    image: 18
  });
});
