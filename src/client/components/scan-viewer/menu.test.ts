import { expect, test } from 'bun:test';

import { memoryDatasetApi } from '@/client/dataset-api/memory';
import { openAppState } from '@/client/state';
import type { CitationRow, Link } from '@/common/types';

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
// Estimated on the Image, with no Box.
const ON_IMAGE: Link = {
  volumeId: '201',
  volume: 'I Aa:201',
  url: '',
  precision: 'image',
  image: 18,
  certainty: 'estimated'
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
    cited: null,
    supports: [],
    transcribed: []
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
const NONE = {
  chooseVolume: unasked,
  placeBox: unasked,
  cite: unasked,
  remind: unasked
};

function labels(
  viewer: Awaited<ReturnType<typeof viewing>>,
  where: { onBox: boolean; canBox: boolean }
) {
  return linkItems(viewer, where, NONE).map((i) => i.label);
}

test('a Citation made in the app offers Delete on its Box; a Mark or Match, Discard; a Match, Confirm', async () => {
  const made = await viewing(citation(1, true));
  expect(labels(made, { onBox: true, canBox: true })).toEqual([
    'Edit',
    'Delete',
    'Add reminder…'
  ]);
  const marked = await viewing(citation(2, false));
  expect(labels(marked, { onBox: true, canBox: true })).toEqual([
    'Edit',
    'Discard',
    'Add reminder…'
  ]);
  const vision = await viewing(citation(3, false), {
    ...AT_ENTRY,
    certainty: 'match'
  });
  expect(labels(vision, { onBox: true, canBox: true })).toEqual([
    'Confirm',
    'Edit',
    'Discard',
    'Add reminder…'
  ]);
});

test('New citation for… shows over the full Image, with nothing pending', async () => {
  const viewer = await viewing(citation(1, false), ON_IMAGE);
  expect(labels(viewer, { onBox: false, canBox: true })).toEqual([
    'Place citation here',
    'New citation for…',
    'Add reminder…',
    'Change Volume…'
  ]);
  expect(labels(viewer, { onBox: false, canBox: false })).toEqual([
    'Add reminder…',
    'Change Volume…'
  ]);
  viewer.setBox(BOX);
  expect(labels(viewer, { onBox: false, canBox: true })).toEqual([
    'Change Volume…'
  ]);
});

test("Place citation here isn't offered with the source's Box on the Image", async () => {
  const viewer = await viewing(citation(1, false));
  expect(labels(viewer, { onBox: false, canBox: true })).toEqual([
    'New citation for…',
    'Add reminder…',
    'Change Volume…'
  ]);
});

test('Add reminder… waits for the pending Box, and for Astia to list the Image', async () => {
  const viewer = await viewing(citation(1, false));
  viewer.editBox();
  expect(labels(viewer, { onBox: true, canBox: true })).toEqual([
    'Discard changes'
  ]);

  const api = memoryDatasetApi({
    volumes: { '201': { images: 40, citations: [] } }
  });
  const listing = openAppState(api).viewer;
  listing.open({ citation: citation(1, false), link: AT_ENTRY });
  expect(labels(listing, { onBox: false, canBox: true })).not.toContain(
    'Add reminder…'
  );
});

test('Place citation here names the source by its reference, under the label', async () => {
  const cited = {
    ...citation(1, false),
    cited: {
      parish: null,
      kind: 'rippi' as const,
      years: { from: 1790, to: 1796 }
    },
    citedPage: 18
  };
  const viewer = await viewing(cited, ON_IMAGE);
  const where = { onBox: false, canBox: true };
  expect(linkItems(viewer, where, NONE)[0]).toMatchObject({
    label: 'Place citation here',
    detail: 'Pää- ja rippikirjat 1790–1796\u00a0· p.\u00a018'
  });
});

test('Place citation here names one made in the app by its Image', async () => {
  const viewer = await viewing(citation(1, true), ON_IMAGE);
  const where = { onBox: false, canBox: true };
  expect(linkItems(viewer, where, NONE)[0]?.detail).toBe('I Aa:201, Image 18');
});

test('opened on an Image with no source, a new Citation and a Reminder are offered', async () => {
  const api = memoryDatasetApi({
    volumes: { '201': { images: 40, citations: [] } }
  });
  const { viewer } = openAppState(api);
  viewer.openImage({ volumeId: '201', volume: 'I Aa:201', image: 18 });
  await Bun.sleep(0);
  expect(labels(viewer, { onBox: false, canBox: true })).toEqual([
    'New citation for…',
    'Add reminder…'
  ]);
  expect(labels(viewer, { onBox: false, canBox: false })).toEqual([
    'Add reminder…'
  ]);
  viewer.citeFor(1, BOX);
  expect(labels(viewer, { onBox: true, canBox: true })).toEqual([
    'Discard changes'
  ]);
});

test('pointing at Place citation here says so, for the panel to mark it', async () => {
  const viewer = await viewing(citation(1, false), ON_IMAGE);
  const [place] = linkItems(viewer, { onBox: false, canBox: true }, NONE);
  place?.hover?.(true);
  expect(viewer.placing.get()).toBe(true);
  place?.hover?.(false);
  expect(viewer.placing.get()).toBe(false);
});
