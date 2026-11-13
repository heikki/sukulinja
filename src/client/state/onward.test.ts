// Going to a Citation from a list, as a Change does: the Scan viewer
// stays open while the person's Links come in, and then turns to it.

import { expect, test } from 'bun:test';

import { memoryDatasetApi } from '@/client/dataset-api/memory';
import type { CitationRow, Link, PersonDetails } from '@/common/types';

import { openAppState } from './';

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

// Matti's Citation 11 and Maija's 21 on Images 18 and 20 of one Volume,
// and Maija's 22 with no scan.
const C11 = churchBook(11);
const C21 = churchBook(21);
const C22 = churchBook(22);
const L11 = onImage(18);
const L21 = onImage(20);

async function settle() {
  await Bun.sleep(0);
}

async function viewing11() {
  const state = openAppState(
    memoryDatasetApi({
      details: { 1: person(1, [C11]), 2: person(2, [C21, C22]) },
      links: {
        1: [{ citationId: 11, links: [L11] }],
        2: [
          { citationId: 21, links: [L21] },
          { citationId: 22, links: [] }
        ]
      },
      volumes: { '201': { images: 40, citations: [] } }
    })
  );
  state.chart.select(1);
  await settle();
  state.viewer.open({ citation: C11, link: L11 });
  return state;
}

test("someone else's stays on what's shown until their Links are in", async () => {
  const { chart, selected, viewer } = await viewing11();
  chart.toCitation(2, 21);
  expect(selected.id.get()).toBe(2);
  expect(viewer.source.get()).toEqual({ citation: C11, link: L11 });
  await settle();
  expect(viewer.source.get()).toEqual({ citation: C21, link: L21 });
  expect(viewer.image.get()).toBe(20);
});

test('one with no way in closes what was shown of someone else', async () => {
  const { chart, viewer } = await viewing11();
  chart.toCitation(2, 22);
  await settle();
  expect(viewer.opened.get()).toBe(null);
});

test('the Selected person’s with no way in leaves the viewer as it is', async () => {
  const { chart, viewer } = await viewing11();
  chart.toCitation(1, 99);
  await settle();
  expect(viewer.source.get()).toEqual({ citation: C11, link: L11 });
});

test('is dropped once the viewer moves on', async () => {
  const { chart, viewer } = await viewing11();
  chart.toCitation(2, 21);
  viewer.openImage({ volumeId: '201', volume: 'I Aa:201', image: 3 });
  await settle();
  expect(viewer.source.get()).toBe(null);
  expect(viewer.image.get()).toBe(3);
});
