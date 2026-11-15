import { expect, test } from 'bun:test';

import { memoryDatasetApi } from '@/client/dataset-api/memory';
import type { CitationRow, Link, VisionTry } from '@/common/types';

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

function tried(links: Link[], missed: string | null): VisionTry {
  return {
    links: { citationId: 7, links },
    missed,
    model: 'claude-haiku-5-5',
    readings: 9,
    cached: 0,
    dollars: 0.002,
    seconds: 12
  };
}

async function viewing(answer: VisionTry) {
  const api = memoryDatasetApi({
    volumes: { '201': { images: 40, citations: [] } },
    visionTries: { 7: answer }
  });
  const { viewer } = openAppState(api);
  viewer.open({ citation: CITATION, link: ESTIMATE });
  await Bun.sleep(0);
  return { viewer, api };
}

test('a Match found is followed, and what it took is told', async () => {
  const { viewer, api } = await viewing(tried([MATCH], null));
  const searching = viewer.findByVision('claude-haiku-5-5');
  expect(viewer.visionMatch.get()).toMatchObject({
    searching: 'claude-haiku-5-5'
  });
  await searching;
  expect(api.asked).toContain('vision 7 claude-haiku-5-5');
  expect(viewer.visionMatch.get()).toMatchObject({ tried: { readings: 9 } });
  expect(viewer.source.get()?.link).toEqual(MATCH);
  expect(viewer.image.get()).toBe(21);
  viewer.forgetVisionMatch();
  expect(viewer.visionMatch.get()).toBeNull();
});

test('none found leaves the viewer on the estimate', async () => {
  const { viewer } = await viewing(tried([ESTIMATE], 'name not found'));
  await viewer.findByVision('claude-haiku-5-5');
  expect(viewer.visionMatch.get()).toMatchObject({
    tried: { missed: 'name not found' }
  });
  expect(viewer.source.get()?.link).toEqual(ESTIMATE);
});

test('a refusal is told in the app’s words', async () => {
  const api = memoryDatasetApi({
    volumes: { '201': { images: 40, citations: [] } }
  });
  const { viewer } = openAppState(api);
  viewer.open({ citation: CITATION, link: ESTIMATE });
  await viewer.findByVision('claude-haiku-5-5');
  expect(viewer.visionMatch.get()).toEqual({ refused: 'citation not found' });
});

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

test('every estimate on the Image is searched once per record, and summed', async () => {
  const api = memoryDatasetApi({
    volumes: { '201': { images: 40, citations: ROWS } },
    visionTries: {
      7: tried([MATCH], null),
      9: tried([ESTIMATE], 'name not found')
    }
  });
  const { viewer } = openAppState(api);
  viewer.open({ citation: CITATION, link: ESTIMATE });
  await Bun.sleep(0);
  expect(viewer.estimatesHere.get().map((r) => r.citation.id)).toEqual([7, 9]);
  const searching = viewer.findAllByVision('claude-haiku-5-5');
  expect(viewer.visionBatch.get()).toMatchObject({ done: 0, of: 2 });
  await searching;
  expect(api.asked.filter((a) => a.startsWith('vision'))).toEqual([
    'vision 7 claude-haiku-5-5',
    'vision 9 claude-haiku-5-5'
  ]);
  expect(viewer.visionBatch.get()).toMatchObject({
    of: 2,
    refused: null,
    atOnce: false
  });
  // The viewer stays on the Image.
  expect(viewer.image.get()).toBe(18);
});

test('a refusal stops the batch', async () => {
  const api = memoryDatasetApi({
    volumes: { '201': { images: 40, citations: ROWS } },
    visionTries: { 9: tried([ESTIMATE], 'name not found') }
  });
  const { viewer } = openAppState(api);
  viewer.open({ citation: CITATION, link: ESTIMATE });
  await Bun.sleep(0);
  await viewer.findAllByVision('claude-haiku-5-5');
  expect(viewer.visionBatch.get()).toMatchObject({
    tries: [],
    refused: 'citation not found'
  });
});

test('every estimate at once is one question, and its Matches undo together', async () => {
  const api = memoryDatasetApi({
    volumes: { '201': { images: 40, citations: ROWS } },
    visionPage: {
      tries: [
        { links: { citationId: 7, links: [MATCH] }, missed: null },
        { links: { citationId: 9, links: [ESTIMATE] }, missed: 'no box' }
      ],
      model: 'claude-haiku-5-5',
      readings: 1,
      cached: 0,
      dollars: 0.003,
      seconds: 9
    },
    discards: { 7: { citationId: 7, links: [ESTIMATE] } }
  });
  const { viewer } = openAppState(api);
  viewer.open({ citation: CITATION, link: ESTIMATE });
  await Bun.sleep(0);
  const searching = viewer.findAllAtOnce('claude-haiku-5-5');
  expect(viewer.visionBatch.get()).toMatchObject({ of: 2, atOnce: true });
  await searching;
  expect(api.asked).toContain('vision all 7,9 on 18 claude-haiku-5-5');
  expect(viewer.visionBatch.get()).toMatchObject({
    tries: [{ tried: { missed: null } }, { tried: { missed: 'no box' } }],
    took: { readings: 1, seconds: 9 },
    atOnce: true
  });
  await viewer.undoVisionBatch();
  expect(api.asked).toContain('discard 7 201/21');
  expect(api.asked.filter((a) => a.startsWith('discard'))).toHaveLength(1);
  expect(viewer.visionBatch.get()).toBeNull();
});
