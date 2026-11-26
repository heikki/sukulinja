import { expect, test } from 'bun:test';

import { memoryDatasetApi } from '@/client/dataset-api/memory';
import type {
  CitationRow,
  Link,
  VisionPageTry,
  VisionSurvey,
  VisionTry
} from '@/common/types';

import { openAppState } from '.';
import { missedOf } from './vision-batch';

const ESTIMATE: Link = {
  volumeId: '201',
  volume: 'I Aa:201',
  url: '',
  precision: 'image',
  image: 18,
  certainty: 'estimated',
  from: 'pins'
};
const MATCH: Link = {
  ...ESTIMATE,
  precision: 'entry',
  image: 21,
  box: { left: 100, top: 200, width: 500, height: 50 },
  certainty: 'match'
};

const CITATION: CitationRow = {
  id: 7,
  source: null,
  reference: null,
  entry: null,
  referenceEntry: null,
  page: null,
  record: null,
  text: null,
  churchBook: true,
  markKey: 'citation 7',
  citedPage: null,
  cited: null,
  supports: [],
  entryId: null,
  event: null,
  fields: null,
  role: null
};

// Three references estimated on Image 18, two of one record.
function row(id: number, markKey: string, link: Link = ESTIMATE) {
  return {
    personId: id,
    citation: { ...CITATION, id, markKey },
    link
  };
}
const ROWS = [
  row(7, 'record 1'),
  row(8, 'record 1'),
  row(9, 'record 2'),
  row(10, 'record 3', MATCH)
];

const PAGE: VisionPageTry = {
  tries: [
    { links: { citationId: 7, links: [MATCH] }, missed: null },
    { links: { citationId: 9, links: [ESTIMATE] }, missed: 'no box' }
  ],
  model: 'claude-haiku-5-5',
  readings: 3,
  cached: 0,
  dollars: 0.003,
  seconds: 9
};

async function viewing(visionPage?: VisionPageTry) {
  const api = memoryDatasetApi({
    volumes: { '201': { images: 40, citations: ROWS } },
    ...(visionPage === undefined ? {} : { visionPage }),
    discards: { 7: { citationId: 7, links: [ESTIMATE] } }
  });
  const { viewer } = openAppState(api);
  viewer.open({ citation: CITATION, link: ESTIMATE });
  await Bun.sleep(0);
  return { viewer, api };
}

test('every estimate on the Image is looked for at once, one per record', async () => {
  const { viewer, api } = await viewing(PAGE);
  expect(viewer.estimatesHere.get().map((r) => r.citation.id)).toEqual([7, 9]);
  const searching = viewer.findAllByVision('claude-haiku-5-5');
  expect(viewer.visionBatch.get()).toMatchObject({
    searching: 'claude-haiku-5-5',
    of: 2
  });
  await searching;
  expect(api.asked).toContain('vision all 7,9 on 18 claude-haiku-5-5');
  expect(viewer.visionBatch.get()).toMatchObject({
    tries: [{ tried: { missed: null } }, { tried: { missed: 'no box' } }],
    took: { readings: 3, seconds: 9 },
    refused: null
  });
  // The viewer stays on the Image.
  expect(viewer.image.get()).toBe(18);
});

test('its Matches are undone together', async () => {
  const { viewer, api } = await viewing(PAGE);
  await viewer.findAllByVision('claude-haiku-5-5');
  await viewer.undoVisionBatch();
  expect(api.asked.filter((a) => a.startsWith('discard'))).toEqual([
    'discard 7 201/21'
  ]);
  expect(viewer.visionBatch.get()).toBeNull();
});

test('a refusal is told in the app’s words', async () => {
  const { viewer } = await viewing();
  await viewer.findAllByVision('claude-haiku-5-5');
  expect(viewer.visionBatch.get()).toMatchObject({
    tries: [],
    refused: 'citation not found',
    took: null
  });
});

// ---------------------------------------------------------------- a Volume

const SURVEY: VisionSurvey = {
  pinned: 6,
  settled: true,
  model: 'claude-haiku-5-5',
  readings: 7,
  cached: 1,
  dollars: 0.002,
  seconds: 12
};

test("a Volume's estimates are located as the server goes, then told by its citations", async () => {
  const later = row(11, 'record 4', { ...ESTIMATE, image: 25 });
  const took = { ...PAGE, tries: undefined };
  const api = memoryDatasetApi({
    volumes: { '201': { images: 40, citations: [...ROWS, later] } },
    locating: [
      { surveying: true },
      { surveyed: SURVEY },
      { searching: { nth: 1, images: 2, estimates: 3 } },
      { tried: PAGE.tries },
      { searching: { nth: 2, images: 2, estimates: 3 } },
      { tried: [{ links: { citationId: 11, links: [] }, missed: 'no box' }] },
      { done: { ...took, readings: 13, cached: 1, seconds: 30 } }
    ]
  });
  const { viewer } = openAppState(api);
  viewer.open({ citation: CITATION, link: ESTIMATE });
  await Bun.sleep(0);
  expect(viewer.estimatesInVolume.get().map((on) => on.image)).toEqual([
    18, 25
  ]);
  const searching = viewer.findAllInVolumeByVision('claude-haiku-5-5');
  expect(viewer.visionBatch.get()).toMatchObject({
    step: 'reading page numbers',
    of: 3
  });
  await searching;
  expect(api.asked.filter((a) => /^(?:locate|citations)/.test(a))).toEqual([
    'citations 201',
    'locate 201 claude-haiku-5-5',
    'citations 201',
    'citations 201'
  ]);
  expect(viewer.visionBatch.get()).toMatchObject({
    tries: [
      { row: { citation: { id: 7 } }, tried: { missed: null } },
      { row: { citation: { id: 9 } }, tried: { missed: 'no box' } },
      { row: { citation: { id: 11 } }, tried: { missed: 'no box' } }
    ],
    of: 3,
    scope: 'volume',
    survey: { pinned: 6, settled: true, readBefore: false },
    took: { readings: 13, cached: 1, seconds: 30 },
    refused: null
  });
  // It's told on any Image of the Volume.
  viewer.show(25);
  expect(viewer.visionBatch.get()).not.toBeNull();
});

test("a Volume's locating stopped is told with why, and what it took", async () => {
  const took = { ...PAGE, tries: undefined };
  const api = memoryDatasetApi({
    volumes: { '201': { images: 40, citations: ROWS } },
    locating: [
      { searching: { nth: 1, images: 1, estimates: 2 } },
      { refused: 'Vision Match failed: overloaded', took }
    ]
  });
  const { viewer } = openAppState(api);
  viewer.open({ citation: CITATION, link: ESTIMATE });
  await Bun.sleep(0);
  await viewer.findAllInVolumeByVision('claude-haiku-5-5');
  expect(viewer.visionBatch.get()).toMatchObject({
    tries: [],
    scope: 'volume',
    survey: null,
    took: { readings: 3 },
    refused: 'Vision Match failed: overloaded'
  });
});

test("a Volume's page survey runs alone, to try it", async () => {
  const api = memoryDatasetApi({
    volumes: { '201': { images: 40, citations: ROWS } },
    survey: SURVEY
  });
  const { viewer } = openAppState(api);
  viewer.open({ citation: CITATION, link: ESTIMATE });
  await Bun.sleep(0);
  await viewer.surveyPagesByVision('claude-haiku-5-5');
  expect(api.asked.filter((a) => /^(?:survey|vision)/.test(a))).toEqual([
    'survey 201 claude-haiku-5-5 fresh'
  ]);
  expect(viewer.visionBatch.get()).toMatchObject({
    scope: 'survey',
    survey: { pinned: 6, settled: true, readBefore: false },
    took: { readings: 7, seconds: 12 }
  });
});

function tried(citationId: number, missed: VisionTry['missed']) {
  return { links: { citationId, links: [] }, missed };
}

test("what a batch didn't find is listed with why, by its Image", () => {
  const later = row(11, 'record 4', { ...ESTIMATE, image: 25 });
  const missed = missedOf([
    { row: later, tried: tried(11, 'unreadable') },
    { row: ROWS[0]!, tried: tried(7, null) },
    { row: ROWS[2]!, tried: tried(9, 'name not found') }
  ]);
  expect(missed.map((m) => [m.row.citation.id, m.why])).toEqual([
    [9, 'name not found'],
    [11, 'unreadable']
  ]);
});
