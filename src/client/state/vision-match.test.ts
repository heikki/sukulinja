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
