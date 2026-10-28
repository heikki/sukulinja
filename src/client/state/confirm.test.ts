// Confirming a Match from the Scan viewer: marking its Image as the Match
// says, from the Box's menu, with how it went shown at the end of the nav.

import { expect, test } from 'bun:test';

import { ApiError } from '@/client/dataset-api';
import { memoryDatasetApi } from '@/client/dataset-api/memory';
import type {
  CitationLinks,
  CitationRow,
  Link,
  PersonDetails,
  VolumeCitation
} from '@/common/types';

import { openAppState } from './';

const BOX = { left: 0, top: 0.5, width: 1, height: 0.05 };

function churchBook(id: number): CitationRow {
  return {
    id,
    source: null,
    reference: null,
    entry: null,
    page: null,
    url: null,
    record: null,
    text: null,
    churchBook: true,
    madeInApp: false,
    markKey: `citation ${id}`,
    citedPage: null,
    cited: null
  };
}

function person(id: number, citations: CitationRow[]): PersonDetails {
  return { id, name: `Person ${id}`, sex: 'U', facts: [], citations };
}

function linksOf(id: number, link: Link): CitationLinks {
  return { citationId: id, links: [link] };
}

// Matti's 11, Estimated on Image 18 of Volume 201; Maria's 21, a Match
// beside it; Liisa's 31, a Match on Image 20 the server won't mark.
const C11 = churchBook(11);
const L11: Link = {
  volumeId: '201',
  volume: 'I Aa:201',
  url: '',
  precision: 'image',
  image: 18,
  certainty: 'estimated'
};
const C21 = churchBook(21);
const VISION_21: Link = {
  ...L11,
  precision: 'entry',
  box: BOX,
  certainty: 'match'
};
const MARKED_21: Link = { ...VISION_21, certainty: 'marked' };
const C31 = churchBook(31);
const VISION_31: Link = { ...VISION_21, image: 20 };

const ROW_11: VolumeCitation = { personId: 1, citation: C11, link: L11 };
const ROW_21: VolumeCitation = { personId: 2, citation: C21, link: VISION_21 };
const ROW_31: VolumeCitation = { personId: 3, citation: C31, link: VISION_31 };

function dataset() {
  return memoryDatasetApi({
    details: {
      1: person(1, [C11]),
      2: person(2, [C21]),
      3: person(3, [C31])
    },
    links: {
      1: [linksOf(11, L11)],
      2: [linksOf(21, VISION_21)],
      3: [linksOf(31, VISION_31)]
    },
    volumes: {
      '201': { images: 40, citations: [ROW_11, ROW_21, ROW_31] }
    },
    marks: { 21: linksOf(21, MARKED_21) }
  });
}

// Every answer the memory API has in hand, given.
async function settle() {
  await Bun.sleep(0);
}

// The viewer open on `row`, its person selected.
async function viewing(row: VolumeCitation) {
  const api = dataset();
  const state = openAppState(api);
  state.chart.select(row.personId);
  await settle();
  state.viewer.open({ citation: row.citation, link: row.link });
  await settle();
  return { api, viewer: state.viewer };
}

test("confirm reloads the citations and the Selected person's Links, and follows its own reference", async () => {
  const { api, viewer } = await viewing(ROW_21);
  await viewer.confirm(ROW_21);
  expect(api.asked.slice(-3)).toEqual([
    'mark 21 201/18',
    'links 2',
    'citations 201'
  ]);
  expect(viewer.source.get()?.link).toEqual(MARKED_21);
});

test("confirming another's row leaves the viewer on its own", async () => {
  const { viewer } = await viewing(ROW_11);
  const shown = viewer.source.get();
  await viewer.confirm(ROW_21);
  expect(viewer.source.get()).toBe(shown);
});

test("a refused confirm throws in the server's words", async () => {
  const { viewer } = await viewing(ROW_31);
  const refused = await viewer
    .confirm(ROW_31)
    .then(() => null)
    .catch((err: unknown) => err);
  expect(refused).toBeInstanceOf(ApiError);
  expect((refused as ApiError).message).toBe('citation not found');
});

test("confirmSource confirms the source's Match, saying so while it saves", async () => {
  const { api, viewer } = await viewing(ROW_21);
  const saving = viewer.confirmSource();
  expect(viewer.confirming.get()).toBe('saving');
  await saving;
  expect(viewer.confirming.get()).toBe(null);
  expect(api.asked).toContain('mark 21 201/18');
  expect(viewer.source.get()?.link).toEqual(MARKED_21);
});

test('a refused confirmSource says why, until the Image changes', async () => {
  const { viewer } = await viewing(ROW_31);
  await viewer.confirmSource();
  expect(viewer.confirming.get()).toEqual({ refused: 'citation not found' });
  viewer.show(21);
  expect(viewer.confirming.get()).toBe(null);
});

test('confirmSource leaves anything but a Match as it is', async () => {
  const { api, viewer } = await viewing(ROW_11);
  const before = api.asked.length;
  await viewer.confirmSource();
  expect(api.asked.length).toBe(before);
  expect(viewer.confirming.get()).toBe(null);
});
