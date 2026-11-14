// Opening a source in the Scan viewer, and Sources brought to it or not:
// from Sources it is, from Events it isn't.

import { expect, test } from 'bun:test';

import { memoryDatasetApi } from '@/client/dataset-api/memory';
import type { CitationRow, Link, PersonDetails } from '@/common/types';

import { openAppState } from './';
import type { LinkStatus } from './sources';

function churchBook(id: number): CitationRow {
  return {
    id,
    source: null,
    reference: null,
    entry: null,
    page: null,
    record: null,
    text: null,
    churchBook: true,
    madeInApp: false,
    markKey: `citation ${id}`,
    citedPage: null,
    cited: null,
    supports: [],
    entryId: null,
    role: null
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

function onImage(image: number): Link {
  return {
    url: '',
    archive: 'Juvan seurakunnan arkisto',
    volumeId: '201',
    volume: 'I Aa:201',
    precision: 'image',
    image,
    certainty: 'marked'
  };
}

function linked(link: Link): LinkStatus {
  return { label: '', link, browse: null, unlinked: null };
}

const NONE: LinkStatus = {
  label: '',
  link: null,
  browse: null,
  unlinked: null
};

// Matti's Citations 11 and 12 on Images 18 and 20 of one Volume, and 13
// with no scan.
const C11 = churchBook(11);
const C12 = churchBook(12);
const C13 = churchBook(13);
const S11 = { citation: C11, status: linked(onImage(18)) };
const S12 = { citation: C12, status: linked(onImage(20)) };
const BOX = { left: 0, top: 0.5, width: 1, height: 0.05 };

async function settle() {
  await Bun.sleep(0);
}

async function viewer() {
  const state = openAppState(
    memoryDatasetApi({
      details: { 1: person(1, [C11, C12, C13]) },
      links: {
        1: [
          { citationId: 11, links: [onImage(18)] },
          { citationId: 12, links: [onImage(20)] },
          { citationId: 13, links: [] }
        ]
      },
      volumes: { '201': { images: 40, citations: [] } }
    })
  );
  state.chart.select(1);
  await settle();
  return state.viewer;
}

test('a source opened from Events leaves Sources where it is', async () => {
  const v = await viewer();
  expect(v.openSource(S11, { reveal: false })).toBe(true);
  expect(v.source.get()?.citation.id).toBe(11);
  expect(v.revealing.get()).toBeNull();
});

test('a source opened from Sources is revealed, and again when opened again', async () => {
  const v = await viewer();
  v.openSource(S11, { reveal: true });
  const first = v.revealing.get();
  expect(first).toBe(v.source.get());
  expect(first?.citation.id).toBe(11);
  v.openSource(S11, { reveal: true });
  expect(v.revealing.get()).not.toBe(first);
  expect(v.revealing.get()?.citation.id).toBe(11);
  // Off its Link, nothing is to be revealed.
  await settle();
  v.show(19);
  expect(v.revealing.get()).toBeNull();
});

test('an open held by a pending Box, then stayed, leaves the next open revealing', async () => {
  const v = await viewer();
  v.openSource(S11, { reveal: true });
  await settle();
  v.setBox(BOX);
  v.openSource(S12, { reveal: false });
  expect(v.leaving.get()).toBe(true);
  await v.answer('keep');
  expect(v.source.get()?.citation.id).toBe(11);
  v.cancel();
  v.open({ citation: C12, link: onImage(20) });
  expect(v.revealing.get()?.citation.id).toBe(12);
});

test('a source with nothing to open in the Scan viewer opens nothing', async () => {
  const v = await viewer();
  expect(v.openSource({ citation: C13, status: NONE }, { reveal: true })).toBe(
    false
  );
  expect(v.openSource({ citation: C13, status: null }, { reveal: false })).toBe(
    false
  );
  expect(v.opened.get()).toBeNull();
});
