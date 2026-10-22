import { expect, test } from 'bun:test';

import { ApiError } from '@/client/dataset-api';
import { memoryDatasetApi } from '@/client/dataset-api/memory';
import type { MemoryDataset } from '@/client/dataset-api/memory';
import type {
  CitationRow,
  Link,
  PersonDetails,
  StalePin
} from '@/common/types';

import { openAppState } from '.';

const ARCHIVE = { url: '', archive: 'Juvan seurakunnan arkisto' };

function onImage(
  volumeId: string,
  image: number,
  certainty: 'marked' | 'estimated'
): Link {
  return {
    ...ARCHIVE,
    volumeId,
    volume: `I Ab:${volumeId}`,
    precision: 'image',
    image,
    certainty
  };
}

function churchBook(id: number): CitationRow {
  return {
    id,
    source: null,
    reference: null,
    entry: 'p. 463',
    page: null,
    url: null,
    record: null,
    text: null,
    churchBook: true,
    madeInApp: false,
    markKey: `citation ${id}`,
    citedPage: 463,
    cited: null
  };
}

const C1 = churchBook(1);
const MARKED = onImage('301', 247, 'marked');
const STALE: StalePin[] = [
  { kind: 'record', from: 'local', by: 'hand', image: 247, record: 5 }
];

function person(): PersonDetails {
  return { id: 1, name: 'Person 1', sex: 'U', facts: [], citations: [C1] };
}

// Person 1's reference, Marked on Image 247 of Volume 301, which Astia
// has re-scanned with 434 Images; Volume 302 it hasn't.
function data(): MemoryDataset {
  return {
    details: { 1: person() },
    links: { 1: [{ citationId: 1, links: [MARKED] }] },
    volumes: {
      '301': {
        images: 455,
        citations: [{ personId: 1, citation: C1, link: MARKED }],
        rescan: { images: 434, stale: STALE }
      },
      '302': { images: 10, citations: [] }
    }
  };
}

async function settle() {
  await Bun.sleep(0);
}

async function opened(given = data()) {
  const api = memoryDatasetApi(given);
  const state = openAppState(api);
  state.chart.select(1);
  await settle();
  state.viewer.open({ citation: C1, link: MARKED });
  await settle();
  return { api, data: given, viewer: state.viewer };
}

function asked(api: { asked: string[] }, prefix: string) {
  return api.asked.filter((a) => a.startsWith(prefix));
}

test('showing a re-scanned Volume asks about it, once while shown', async () => {
  const { api, viewer } = await opened();
  expect(viewer.rescan.get()).toEqual({
    cached: 455,
    images: 434,
    stale: STALE
  });
  await viewer.imageFailed();
  expect(asked(api, 'rescan')).toEqual(['rescan 301']);
});

test('an Image failing asks again when showing the Volume got no answer', async () => {
  const given = data();
  const api = memoryDatasetApi(given);
  const state = openAppState(api);
  state.chart.select(1);
  await settle();
  const answer = api.volumeRescan;
  api.volumeRescan = () => Promise.reject(new ApiError('Astia is down'));
  state.viewer.open({ citation: C1, link: MARKED });
  await settle();
  expect(state.viewer.rescan.get()).toBeNull();
  api.volumeRescan = answer;
  await state.viewer.imageFailed();
  expect(state.viewer.rescan.get()).not.toBeNull();
});

test("showing a Volume Astia hasn't re-scanned asks nothing more", async () => {
  const given = data();
  delete given.volumes!['301']!.rescan;
  const { viewer } = await opened(given);
  expect(viewer.rescan.get()).toBeNull();
  await viewer.imageFailed();
  expect(viewer.rescan.get()).toBeNull();
});

test('switching takes the new filming, and follows the Link resolved anew', async () => {
  const { api, data: given, viewer } = await opened();
  // The Mark was made on the old filming: resolved anew, it's an estimate.
  given.links![1] = [
    { citationId: 1, links: [onImage('301', 232, 'estimated')] }
  ];
  await viewer.switchFilming();
  expect(asked(api, 'switch')).toEqual(['switch 301']);
  expect(viewer.rescan.get()).toBeNull();
  expect(viewer.oldFilming.get()).toBe(false);
  expect(viewer.count.get()).toBe(434);
  expect(asked(api, 'citations 301')).toHaveLength(2);
  expect(viewer.source.get()?.link?.certainty).toBe('estimated');
  expect(viewer.image.get()).toBe(232);
});

test('Not now keeps the filming shown, until the Volume is shown again', async () => {
  const { api, viewer } = await opened();
  viewer.keepFilming();
  expect(viewer.rescan.get()).toBeNull();
  // Its Images not on disk still can't load.
  expect(viewer.oldFilming.get()).toBe(true);
  await viewer.imageFailed();
  expect(viewer.rescan.get()).toBeNull();
  expect(asked(api, 'switch')).toEqual([]);
  viewer.changeVolume({ id: '302', label: 'I Ab:302', years: null });
  viewer.changeVolume({ id: '301', label: 'I Ab:301', years: null });
  await settle();
  expect(viewer.rescan.get()).not.toBeNull();
  expect(asked(api, 'rescan')).toEqual([
    'rescan 301',
    'rescan 302',
    'rescan 301'
  ]);
});

test('the question comes back when asked, until switched', async () => {
  const { viewer } = await opened();
  const asked = viewer.rescan.get();
  viewer.keepFilming();
  viewer.askAgain();
  expect(viewer.rescan.get()).toEqual(asked);
  await viewer.switchFilming();
  viewer.askAgain();
  expect(viewer.rescan.get()).toBeNull();
});

test('a Volume on its old filming is read-only', async () => {
  const { api, viewer } = await opened();
  viewer.keepFilming();
  viewer.setBox({ left: 0, top: 0.5, width: 0.5, height: 0.05 });
  expect(viewer.pending.get()).toBeNull();
  await viewer.confirm({ citation: C1, link: MARKED });
  expect(asked(api, 'mark')).toEqual([]);
});
