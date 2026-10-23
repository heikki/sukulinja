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
  return linkItems(viewer, { ...where, name: 'Matti Esimerkki' }, NONE).map(
    (i) => i.label
  );
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

test('Create entry for… shows over the full Image, with nothing pending', async () => {
  const viewer = await viewing(citation(1, false), ON_IMAGE);
  expect(labels(viewer, { onBox: false, canBox: true })).toEqual([
    'Create entry for Matti Esimerkki',
    'Create entry for…',
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

test("Create entry isn't offered with the person's Box on the Image", async () => {
  const viewer = await viewing(citation(1, false));
  expect(labels(viewer, { onBox: false, canBox: true })).toEqual([
    'Create entry for…',
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

test("Create entry names the source's person, when they have a name", async () => {
  const viewer = await viewing(citation(1, false), ON_IMAGE);
  const where = { onBox: false, canBox: true, name: null };
  expect(linkItems(viewer, where, NONE)[0]?.label).toBe('Create entry');
});
