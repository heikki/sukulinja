// Citing an entry from the Scan viewer, with a source or none: a pending
// Box for someone's new Citation, saved and opened, or cancelled, and
// deleting a Citation made in the app.

import { expect, test } from 'bun:test';

import { memoryDatasetApi } from '@/client/dataset-api/memory';
import type {
  CitationRow,
  Link,
  PersonDetails,
  VolumeCitation
} from '@/common/types';

import { openAppState } from './';

const BOX = { left: 100, top: 200, width: 500, height: 50 };

function churchBook(id: number, madeInApp = false): CitationRow {
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

function person(id: number, citations: CitationRow[]): PersonDetails {
  return {
    id,
    name: `Person ${id}`,
    sex: 'U',
    facts: [],
    marriages: [],
    citations,
    photos: []
  };
}

// Matti's 11, Estimated on Image 18 of Volume 201; his 12, made in the app
// at the entry on Image 20.
const C11 = churchBook(11);
const L11: Link = {
  volumeId: '201',
  volume: 'I Aa:201',
  url: '',
  precision: 'image',
  image: 18,
  certainty: 'estimated'
};
const C12 = churchBook(12, true);
const L12: Link = {
  ...L11,
  precision: 'entry',
  image: 20,
  box: BOX,
  certainty: 'marked'
};

function dataset() {
  const rows: VolumeCitation[] = [
    { personId: 1, citation: C11, link: L11 },
    { personId: 1, citation: C12, link: L12 }
  ];
  return memoryDatasetApi({
    details: { 1: person(1, [C11, C12]), 2: person(2, []) },
    links: {
      1: [
        { citationId: 11, links: [L11] },
        { citationId: 12, links: [L12] }
      ]
    },
    volumes: { '201': { images: 40, citations: rows } }
  });
}

async function settle() {
  await Bun.sleep(0);
}

// Matti selected, his 11 open on Image 18.
async function viewing() {
  const api = dataset();
  const state = openAppState(api);
  state.chart.select(1);
  await settle();
  state.viewer.open({ citation: C11, link: L11 });
  await settle();
  return { api, state, viewer: state.viewer };
}

test('a pending Citation is saved for its person, with its text, and opens', async () => {
  const { api, state, viewer } = await viewing();
  viewer.citeFor(2, BOX);
  expect(viewer.boxHere.get()).toEqual(BOX);
  expect(viewer.boxPending.get()).toBe(true);
  const moved = { ...BOX, top: 260 };
  viewer.setBox(moved);
  viewer.setCiteText('  Baptism 12.3.1795 ');
  viewer.setCiteRole('FATH');
  expect(viewer.pending.get()?.cite).toEqual({
    personId: 2,
    text: '  Baptism 12.3.1795 ',
    role: 'FATH'
  });

  await state.chart.save();
  await settle();
  expect(api.asked).toContain(
    'cite 2 201/18 201-f18 as FATH: Baptism 12.3.1795'
  );
  expect(viewer.pending.get()).toBeNull();
  // Made for Person 2, who's selected, the viewer on it.
  expect(state.selected.id.get()).toBe(2);
  expect(viewer.source.get()?.citation.madeInApp).toBe(true);
  expect(viewer.image.get()).toBe(18);
  const rows = viewer.citations.get();
  const made = Array.isArray(rows) ? rows.find((r) => r.personId === 2) : null;
  expect(made?.link).toMatchObject({ image: 18, box: moved });
});

test('a pending Citation without text is saved with none, and Cancel leaves nothing', async () => {
  const { api, viewer } = await viewing();
  viewer.citeFor(2, BOX);
  viewer.cancel();
  expect(viewer.pending.get()).toBeNull();
  expect(viewer.source.get()?.citation.id).toBe(11);

  viewer.citeFor(1, BOX);
  expect(await viewer.save()).toBeNull();
  expect(api.asked.filter((a) => a.startsWith('cite'))).toEqual([
    'cite 1 201/18 201-f18'
  ]);
  // Matti's own: the viewer opens on it, him still selected.
  expect(viewer.source.get()?.citation.text).toBeNull();
  expect(viewer.source.get()?.citation.madeInApp).toBe(true);
  // Matti's sources read again, with the new Citation.
  expect(api.asked.filter((a) => a === 'person 1')).toHaveLength(2);
});

test('a way out of a pending Citation waits to save it', async () => {
  const { api, viewer } = await viewing();
  viewer.citeFor(2, BOX);
  viewer.show(19);
  expect(viewer.leaving.get()).toBe(true);
  expect(viewer.image.get()).toBe(18);
  await viewer.answer('save');
  expect(api.asked).toContain('cite 2 201/18 201-f18');
  expect(viewer.image.get()).toBe(19);
  expect(viewer.source.get()?.citation.id).toBe(11);
});

test('opened on an Image with no source, a new Citation is made and opens', async () => {
  const api = dataset();
  const state = openAppState(api);
  state.chart.select(1);
  await settle();
  const { viewer } = state;
  viewer.openImage({ volumeId: '201', volume: 'I Aa:201', image: 22 });
  await settle();
  viewer.citeFor(1, BOX);
  viewer.setBox({ ...BOX, top: 300 });
  expect(viewer.pending.get()).toMatchObject({
    image: 22,
    box: { top: 300 },
    cite: { personId: 1 }
  });
  viewer.setCiteText('Baptism 1.2.1800');
  await state.chart.save();
  expect(api.asked).toContain('cite 1 201/22 201-f22: Baptism 1.2.1800');
  expect(viewer.source.get()?.citation.text).toBe('Baptism 1.2.1800');
  expect(viewer.source.get()?.link).toMatchObject({ image: 22 });
  expect(viewer.pending.get()).toBeNull();
});

test('opened on an Image with no source, Cancel drops the pending Citation', async () => {
  const { viewer } = await viewing();
  viewer.openImage({ volumeId: '201', volume: 'I Aa:201', image: 22 });
  await settle();
  viewer.citeFor(2, BOX);
  viewer.cancel();
  expect(viewer.pending.get()).toBeNull();
  expect(viewer.image.get()).toBe(22);
  expect(viewer.source.get()).toBeNull();
});

test('a Discard of a Citation made in the app deletes it, once confirmed', async () => {
  const { api, viewer } = await viewing();
  viewer.open({ citation: C12, link: L12 });
  await settle();
  viewer.discard();
  expect(viewer.discarding.get()).toBe(true);
  viewer.cancel();
  expect(api.asked).not.toContain('uncite 12');

  viewer.discard();
  await viewer.confirmDiscard();
  expect(api.asked).toContain('uncite 12');
  expect(viewer.source.get()).toBeNull();
});
