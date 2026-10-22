import { expect, test } from 'bun:test';

import { memoryDatasetApi } from '@client/dataset-api/memory';
import { openAppState } from '@client/state';
import type { CitationRow, Link } from '@common/types';

import { linkItems } from './menu';

const BOX = { left: 100, top: 200, width: 500, height: 50 };
const AT_ENTRY: Link = {
  volumeId: '201',
  volume: 'I Aa:201',
  url: '',
  precision: 'entry',
  image: 18,
  box: BOX,
  certainty: 'marked'
};

function citation(id: number, madeInApp: boolean): CitationRow {
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
    madeInApp,
    markKey: `citation ${id}`,
    citedPage: null,
    cited: null
  };
}

// The viewer open on the citation's Box.
async function viewing(c: CitationRow, link = AT_ENTRY) {
  const api = memoryDatasetApi({
    volumes: { '201': { images: 40, citations: [] } }
  });
  const { viewer } = openAppState(api);
  viewer.open({ citation: c, link });
  await Bun.sleep(0);
  return viewer;
}

// What the items open isn't asked here.
function unasked() {
  return undefined;
}
const NONE = { chooseVolume: unasked, placeBox: unasked, cite: unasked };

function labels(
  viewer: Awaited<ReturnType<typeof viewing>>,
  where: { onBox: boolean; canBox: boolean }
) {
  return linkItems(viewer, where, NONE).map((i) => i.label);
}

test('a Citation made in the app offers Delete citation on its Box; a Mark, Discard', async () => {
  const made = await viewing(citation(1, true));
  expect(labels(made, { onBox: true, canBox: true })).toEqual([
    'Edit mark',
    'Delete citation'
  ]);
  const marked = await viewing(citation(2, false));
  expect(labels(marked, { onBox: true, canBox: true })).toEqual([
    'Edit mark',
    'Discard mark'
  ]);
  const vision = await viewing(citation(3, false), {
    ...AT_ENTRY,
    certainty: 'match'
  });
  expect(labels(vision, { onBox: true, canBox: true })).toEqual([
    'Edit match',
    'Discard match'
  ]);
});

test('Cite this entry for… shows over the full Image, with nothing pending', async () => {
  const viewer = await viewing(citation(1, false));
  expect(labels(viewer, { onBox: false, canBox: true })).toEqual([
    'Mark entry',
    'Cite this entry for…',
    'Change Volume…'
  ]);
  expect(labels(viewer, { onBox: false, canBox: false })).toEqual([
    'Change Volume…'
  ]);
  viewer.editBox();
  expect(labels(viewer, { onBox: false, canBox: true })).toEqual([
    'Mark entry',
    'Change Volume…'
  ]);
});
