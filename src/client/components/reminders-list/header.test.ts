import { expect, test } from 'bun:test';

import { memoryDatasetApi } from '@/client/dataset-api/memory';
import { openAppState } from '@/client/state';
import type {
  CitationRow,
  Link,
  On,
  PersonRow,
  Reminder,
  VolumeCitation
} from '@/common/types';

import { headerOf } from './header';
import { onLines } from './lines';

function reminder(on: On): Reminder {
  return { id: 1, text: 'R', on, created: '', done: null };
}

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

const C11: CitationRow = {
  id: 11,
  source: 'Juva rippikirja',
  reference: 'Juva rippikirja 1790-1796 s. 18',
  entry: null,
  page: null,
  url: null,
  record: null,
  text: null,
  churchBook: true,
  madeInApp: false,
  deletable: false,
  markKey: 'citation 11',
  citedPage: 18,
  cited: { parish: 'Juva', kind: 'rippi', years: null }
};
const C12: CitationRow = {
  ...C11,
  id: 12,
  reference: 'Juva lastenkirja 1800-1810 s. 3',
  markKey: 'citation 12',
  citedPage: 3,
  cited: { parish: 'Juva', kind: 'lasten', years: { from: 1800, to: 1810 } }
};
const L11: Link = {
  volumeId: '201',
  volume: 'I Aa:1 Pää- ja rippikirjat (1790-1796)',
  url: '',
  precision: 'image',
  image: 40,
  certainty: 'estimated'
};
const ROW_11: VolumeCitation = { personId: 1, citation: C11, link: L11 };

const CITATION: On = {
  kind: 'citation',
  personId: 1,
  citationId: 11,
  source: C11.source,
  reference: C11.reference
};
const IMAGE: On = {
  kind: 'image',
  volumeId: '201',
  volume: 'I Aa:1 Pää- ja rippikirjat (1790-1796)',
  image: 40,
  fileId: '201-f40',
  stale: false,
  personId: null
};

async function loaded() {
  const state = openAppState(
    memoryDatasetApi({
      persons: [MATTI],
      details: {
        1: { id: 1, name: 'Matti', sex: 'M', facts: [], citations: [C11, C12] }
      },
      links: { 1: [{ citationId: 11, links: [L11] }] },
      volumes: { '201': { images: 60, citations: [ROW_11] } }
    })
  );
  await state.chart.load(() => ({ rootId: 1, selectedId: 1, panned: false }));
  return state;
}

test('a person is headed by their name', async () => {
  const state = await loaded();
  const on: On = { kind: 'person', personId: 1 };
  expect(headerOf(state, reminder(on))).toEqual(['Matti Testinen']);
});

test("a Citation's by its person, then the Volume, as the Scan viewer names it, and page", async () => {
  const state = await loaded();
  await state.selected.select(1);
  expect(headerOf(state, reminder(CITATION))).toEqual([
    'Matti Testinen',
    'Pää- ja rippikirjat (1790-1796) · page 18'
  ]);
});

test('a Citation without a Link, by its book as the reference gives it', async () => {
  const state = await loaded();
  await state.selected.select(1);
  const unlinked: On = { ...CITATION, citationId: 12 };
  expect(headerOf(state, reminder(unlinked))[1]).toBe(
    'Lastenkirjat 1800–1810\u00a0· p.\u00a03'
  );
});

test("a Citation's falls back to its reference while its Link isn't in", () => {
  const state = openAppState(memoryDatasetApi({}));
  expect(headerOf(state, reminder(CITATION))).toEqual([
    'Someone',
    'Juva rippikirja 1790-1796 s. 18'
  ]);
});

test("an Image's by its Volume, as the Scan viewer names it, and Image", () => {
  const state = openAppState(memoryDatasetApi({}));
  expect(headerOf(state, reminder(IMAGE))).toEqual([
    'Pää- ja rippikirjat (1790-1796) · Image 40'
  ]);
});

test('keeps what it found once the Scan viewer closes', async () => {
  const state = await loaded();
  state.viewer.open({ citation: C11, link: L11 });
  await Bun.sleep(0);
  const citation = headerOf(state, reminder(CITATION));
  expect(citation[1]).toBe('Pää- ja rippikirjat (1790-1796) · page 18');
  state.viewer.close();
  await Bun.sleep(0);
  expect(headerOf(state, reminder(CITATION))).toEqual(citation);
});

test("a Citation's lines go to its person, then to it", async () => {
  const state = await loaded();
  const lines = onLines(state, reminder(CITATION));
  expect(lines.map((l) => l.to)).toEqual([
    { kind: 'person', personId: 1 },
    CITATION
  ]);
  expect(lines[0]?.text).toBe('Matti Testinen');
});

test("a person's one line goes to them", async () => {
  const state = await loaded();
  const on: On = { kind: 'person', personId: 1 };
  expect(onLines(state, reminder(on))).toEqual([
    { text: 'Matti Testinen', to: on }
  ]);
});

test("an Image's line goes to it, unless it's from an earlier filming", async () => {
  const state = await loaded();
  expect(onLines(state, reminder(IMAGE))[0]?.to).toEqual(IMAGE);
  const stale: On = { ...IMAGE, stale: true };
  expect(onLines(state, reminder(stale))[0]?.to).toBeNull();
});

test('an Image about someone goes to them, then to the Image', async () => {
  const state = await loaded();
  const on: On = { ...IMAGE, personId: 1 };
  const lines = onLines(state, reminder(on));
  expect(lines.map((l) => l.to)).toEqual([{ kind: 'person', personId: 1 }, on]);
  expect(lines[0]?.text).toBe('Matti Testinen');
  expect(lines[1]?.text).toContain('Image 40');
});
