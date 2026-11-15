import { expect, test } from 'bun:test';

import { memoryDatasetApi } from '@/client/dataset-api/memory';
import type { CitationRow, Link, VisionPageTry } from '@/common/types';

import { openAppState } from '.';

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
  page: null,
  record: null,
  text: null,
  churchBook: true,
  madeInApp: false,
  markKey: 'citation 7',
  citedPage: null,
  cited: null,
  supports: [],
  entryId: null,
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
