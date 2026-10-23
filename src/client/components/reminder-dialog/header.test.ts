import { expect, test } from 'bun:test';

import { memoryDatasetApi } from '@/client/dataset-api/memory';
import { openAppState } from '@/client/state';
import type {
  CitationRow,
  Link,
  PersonRow,
  Reminder,
  ReminderOn,
  VolumeCitation
} from '@/common/types';

import { headerOf } from './header';

function reminder(on: ReminderOn): Reminder {
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
  markKey: 'citation 11',
  citedPage: 18,
  cited: { parish: 'Juva', kind: 'rippi', years: null }
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

const CITATION: ReminderOn = {
  kind: 'citation',
  personId: 1,
  citationId: 11,
  source: C11.source,
  reference: C11.reference
};
const IMAGE: ReminderOn = {
  kind: 'image',
  volumeId: '201',
  volume: 'I Aa:1 Pää- ja rippikirjat (1790-1796)',
  image: 40,
  fileId: '201-f40',
  stale: false
};

async function loaded() {
  const state = openAppState(
    memoryDatasetApi({
      persons: [MATTI],
      details: {
        1: { id: 1, name: 'Matti', sex: 'M', facts: [], citations: [C11] }
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
  const on: ReminderOn = { kind: 'person', personId: 1 };
  expect(headerOf(state, reminder(on))).toEqual(['Matti Testinen']);
});

test("a Citation's by its person, then the parish, Volume and page", async () => {
  const state = await loaded();
  await state.selected.select(1);
  expect(headerOf(state, reminder(CITATION))).toEqual([
    'Matti Testinen',
    'Juva · I Aa:1 Pää- ja rippikirjat (1790-1796) · page 18'
  ]);
});

test("a Citation's falls back to its reference while its Link isn't in", () => {
  const state = openAppState(memoryDatasetApi({}));
  expect(headerOf(state, reminder(CITATION))).toEqual([
    'Someone',
    'Juva rippikirja 1790-1796 s. 18'
  ]);
});

test("an Image's by its parish, once the Scan viewer shows it, Volume and Image", async () => {
  const state = await loaded();
  const volume = 'I Aa:1 Pää- ja rippikirjat (1790-1796)';
  expect(headerOf(state, reminder(IMAGE))).toEqual([`${volume} · Image 40`]);
  state.viewer.openImage({ volumeId: '201', volume, image: 40 });
  await Bun.sleep(0);
  expect(headerOf(state, reminder(IMAGE))).toEqual([
    `Juva · ${volume} · Image 40`
  ]);
});

test('keeps what it found once the Scan viewer closes', async () => {
  const state = await loaded();
  const volume = 'I Aa:1 Pää- ja rippikirjat (1790-1796)';
  state.viewer.open({ citation: C11, link: L11 });
  await Bun.sleep(0);
  const citation = headerOf(state, reminder(CITATION));
  const image = headerOf(state, reminder(IMAGE));
  expect(image).toEqual([`Juva · ${volume} · Image 40`]);
  state.viewer.close();
  await Bun.sleep(0);
  expect(headerOf(state, reminder(CITATION))).toEqual(citation);
  expect(headerOf(state, reminder(IMAGE))).toEqual(image);
});
