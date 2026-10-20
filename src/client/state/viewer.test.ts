import { expect, test } from 'bun:test';

import { ApiError } from '@client/dataset-api';
import { memoryDatasetApi } from '@client/dataset-api/memory';
import type { MemoryOptions } from '@client/dataset-api/memory';
import type {
  CitationLinks,
  CitationRow,
  Link,
  PersonDetails,
  VolumeCitation
} from '@common/types';

import { openAppState } from '.';
import { clampImage } from './viewer';

const ARCHIVE = { url: '', archive: 'Juvan seurakunnan arkisto' };
const BOX = { left: 0, top: 0.5, width: 1, height: 0.05 };

function onImage(volumeId: string, image: number): Link {
  return {
    ...ARCHIVE,
    volumeId,
    volume: `I Aa:${volumeId}`,
    precision: 'image',
    image,
    certainty: 'estimated'
  };
}

function inVolume(volumeId: string): Link {
  return {
    ...ARCHIVE,
    volumeId,
    volume: `I Aa:${volumeId}`,
    precision: 'volume',
    certainty: 'estimated'
  };
}

function churchBook(id: number, citedPage: number | null): CitationRow {
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
    citedPage,
    cited: null
  };
}

function person(id: number, citations: CitationRow[]): PersonDetails {
  return { id, name: `Person ${id}`, sex: 'U', facts: [], citations };
}

// Matti's references: 11 on Image 18 of Volume 201 and 12 somewhere in it,
// 13 on Image 5 of Volume 202, and 14 unlinked.
const C11 = churchBook(11, 10);
const C12 = churchBook(12, 20);
const C13 = churchBook(13, 5);
const C14 = churchBook(14, null);
const L11 = onImage('201', 18);
const L12 = inVolume('201');
const L13 = onImage('202', 5);
// Maria's 21, a Vision match beside Matti's 11.
const C21 = churchBook(21, null);
const VISION_21: Link = {
  ...ARCHIVE,
  volumeId: '201',
  volume: 'I Aa:201',
  precision: 'entry',
  image: 18,
  box: BOX,
  certainty: 'vision'
};
const MARKED_21: Link = { ...VISION_21, certainty: 'marked' };

// Matti's 12 marked as only in Volume 202.
const MARKED_202: Link = {
  ...inVolume('202'),
  volume: 'I Aa:202 (1797-1803)',
  certainty: 'marked'
};
const CHOICE_202 = { id: '202', label: 'I Aa:202 (1797-1803)', years: null };
const CHOICE_201 = { id: '201', label: 'I Aa:201', years: null };
// Person 3's 15, Split between Volumes 201 and 202.
const C15 = churchBook(15, null);
const L15 = inVolume('201');

const S11 = { citation: C11, link: L11 };
const S12 = { citation: C12, link: L12 };
const S13 = { citation: C13, link: L13 };

const ROW_11: VolumeCitation = {
  personId: 1,
  citation: C11,
  link: L11
};
const ROW_21: VolumeCitation = {
  personId: 2,
  citation: C21,
  link: VISION_21
};

function linksOf(id: number, link: Link): CitationLinks {
  return { citationId: id, links: [link] };
}

function dataset(options: MemoryOptions = {}) {
  return memoryDatasetApi(
    {
      details: {
        1: person(1, [C11, C12, C13, C14]),
        2: person(2, [C21]),
        3: person(3, [C15])
      },
      links: {
        1: [
          linksOf(11, L11),
          linksOf(12, L12),
          linksOf(13, L13),
          { citationId: 14, unlinked: 'not-digitized' }
        ],
        2: [linksOf(21, VISION_21)],
        3: [{ citationId: 15, links: [L15, inVolume('202')] }]
      },
      volumes: {
        '201': { images: 40, citations: [ROW_11, ROW_21] },
        '202': { images: 10, citations: [] }
      },
      marks: {
        12: linksOf(12, MARKED_202),
        15: linksOf(15, { ...L15, certainty: 'marked' }),
        21: linksOf(21, MARKED_21)
      },
      discards: { 21: linksOf(21, onImage('201', 20)) }
    },
    options
  );
}

// Every answer the memory API has in hand, given.
async function settle() {
  await Bun.sleep(0);
}

// The app state over `api`, with `id` selected and their Links in.
async function selecting(id: number, api = dataset()) {
  const state = openAppState(api);
  state.select(id);
  await settle();
  return { api, state, viewer: state.viewer };
}

test("open goes to the Link's Image; one to only the Volume holds anywhere in it", async () => {
  const { viewer } = await selecting(1);
  viewer.open(S11);
  expect(viewer.volume.get()).toEqual({ id: '201', label: 'I Aa:201' });
  expect(viewer.image.get()).toBe(18);
  await settle();
  viewer.show(25);
  viewer.open(S12);
  expect(viewer.image.get()).toBe(25);
  expect(viewer.away.get()).toBe(false);
  viewer.open(S13);
  expect([viewer.volume.get()?.id, viewer.image.get()]).toEqual(['202', 5]);
  // In another Volume, it opens on the first Image.
  viewer.open(S12);
  expect([viewer.volume.get()?.id, viewer.image.get()]).toEqual(['201', 1]);
});

test('opening the source shown goes back to its Image', async () => {
  const { viewer } = await selecting(1);
  viewer.open(S11);
  const first = viewer.source.get();
  await settle();
  viewer.show(20);
  expect(viewer.away.get()).toBe(true);
  viewer.open(S11);
  expect(viewer.image.get()).toBe(18);
  expect(viewer.away.get()).toBe(false);
  expect(viewer.source.get()).not.toBe(first);
});

test('show keeps to the Images Astia lists, once it has said how many', async () => {
  const { api, viewer } = await selecting(1);
  viewer.open(S11);
  viewer.show(99);
  expect(viewer.count.get()).toBe(null);
  expect(viewer.image.get()).toBe(99);
  await settle();
  expect(viewer.count.get()).toBe(40);
  expect(viewer.image.get()).toBe(40);
  viewer.show(41);
  expect(viewer.image.get()).toBe(40);
  viewer.show(0);
  expect(viewer.image.get()).toBe(1);
  expect(api.asked.filter((a) => a.endsWith(' 201'))).toEqual([
    'images 201',
    'citations 201'
  ]);
});

test('keeps an image number inside the Volume', () => {
  expect(clampImage(0, 354)).toBe(1);
  expect(clampImage(355, 354)).toBe(354);
  expect(clampImage(107.4, 354)).toBe(107);
  expect(clampImage(9999, null)).toBe(9999);
  expect(clampImage(-3, null)).toBe(1);
});

test('step walks the linked sources in order, only while they can be seen', async () => {
  const { viewer } = await selecting(1);
  viewer.open(S11);
  viewer.step(1);
  expect(viewer.source.get()?.citation.id).toBe(11);
  viewer.setSourcesInView(true);
  viewer.step(-1);
  expect(viewer.source.get()?.citation.id).toBe(11);
  const walked = [];
  for (let i = 0; i < 3; i++) {
    viewer.step(1);
    walked.push(viewer.source.get()?.citation.id);
  }
  expect(walked).toEqual([12, 13, 13]);
  viewer.step(-1);
  expect(viewer.source.get()?.citation.id).toBe(12);
});

test('selecting someone else closes the viewer', async () => {
  const { state, viewer } = await selecting(1);
  viewer.open(S11);
  state.select(2);
  expect(viewer.source.get()).toBe(null);
  expect(viewer.away.get()).toBe(false);
});

test('picking someone in the viewer goes on with their citation once selected', async () => {
  const { state, viewer } = await selecting(1);
  viewer.open(S11);
  expect(viewer.pick(ROW_21)).toBe(2);
  expect(viewer.source.get()?.citation.id).toBe(11);
  state.select(2);
  expect(viewer.source.get()).toEqual({ citation: C21, link: VISION_21 });
  // The Selected person's own row opens at once, back on its Image.
  viewer.show(30);
  const shown = viewer.source.get();
  expect(viewer.pick(ROW_21)).toBe(null);
  expect(viewer.source.get()).not.toBe(shown);
  expect(viewer.image.get()).toBe(18);
});

test('a pick for one person is dropped when another is selected', async () => {
  const { state, viewer } = await selecting(1);
  viewer.open(S11);
  viewer.pick(ROW_21);
  state.select(3);
  expect(viewer.source.get()).toBe(null);
  state.select(2);
  expect(viewer.source.get()).toBe(null);
});

test("confirm reloads the citations and the Selected person's Links, and follows its own reference", async () => {
  const { api, viewer } = await selecting(2);
  viewer.open({ citation: C21, link: VISION_21 });
  await settle();
  await viewer.confirm(ROW_21);
  expect(api.asked.slice(-3)).toEqual([
    'mark 21 201/18',
    'links 2',
    'citations 201'
  ]);
  expect(viewer.source.get()?.link).toEqual(MARKED_21);
});

test("confirming another's row beside the scan leaves the viewer on its own", async () => {
  const { viewer } = await selecting(1);
  viewer.open(S11);
  await settle();
  const shown = viewer.source.get();
  await viewer.confirm(ROW_21);
  expect(viewer.source.get()).toBe(shown);
});

test("a refused confirm throws in the server's words", async () => {
  const { viewer } = await selecting(1);
  viewer.open(S11);
  await settle();
  const refused = await viewer
    .confirm(ROW_11)
    .then(() => null)
    .catch((err: unknown) => err);
  expect(refused).toBeInstanceOf(ApiError);
  expect((refused as ApiError).message).toBe('citation not found');
});

test('with Astia down the count stays unknown and the citations failed', async () => {
  const state = openAppState(dataset({ down: true }));
  state.viewer.open(S11);
  await settle();
  expect(state.viewer.count.get()).toBe(null);
  expect(state.viewer.citations.get()).toBe('failed');
  expect(state.viewer.image.get()).toBe(18);
});

// ---------------------------------------------------------------- changes

test('changing the Volume only shows it, and its own Volume goes back to the Link', async () => {
  const { api, viewer } = await selecting(1);
  viewer.open(S11);
  await settle();
  viewer.changeVolume(CHOICE_202);
  expect(viewer.pending.get()).toBe(null);
  expect([viewer.volume.get()?.id, viewer.image.get()]).toEqual(['202', 1]);
  expect(viewer.source.get()).toEqual(S11);
  expect(viewer.away.get()).toBe(true);
  viewer.changeVolume(CHOICE_201);
  expect([viewer.volume.get()?.id, viewer.image.get()]).toEqual(['201', 18]);
  expect(api.asked.filter((a) => a.startsWith('mark'))).toEqual([]);
});

test('a source with no Link opens on no Volume, and Cancel stays where the Box was', async () => {
  const { api, viewer } = await selecting(1);
  const unlinked = { unlinked: 'no-volume' as const, archive: ARCHIVE.archive };
  viewer.open({ citation: C14, link: null, unlinked });
  expect(viewer.source.get()?.link).toBe(null);
  expect(viewer.volume.get()).toBe(null);
  expect(viewer.away.get()).toBe(false);
  viewer.changeVolume(CHOICE_202);
  expect([viewer.volume.get()?.id, viewer.image.get()]).toEqual(['202', 1]);
  await settle();
  viewer.show(7);
  viewer.setBox(BOX);
  expect(viewer.pending.get()).toMatchObject({ volumeId: '202', image: 7 });
  viewer.cancel();
  expect(viewer.pending.get()).toBe(null);
  expect([viewer.volume.get()?.id, viewer.image.get()]).toEqual(['202', 7]);
  expect(api.asked.filter((a) => a.startsWith('mark'))).toEqual([]);
});

test('placing a Box puts the source there, pending, and Cancel goes back to the Link', async () => {
  const { viewer } = await selecting(1);
  viewer.open(S11);
  await settle();
  viewer.setBox(BOX);
  expect(viewer.pending.get()).toEqual({
    volumeId: '201',
    volume: 'I Aa:201',
    image: 18,
    box: BOX
  });
  expect(viewer.boxPending.get()).toBe(true);
  viewer.cancel();
  expect(viewer.pending.get()).toBe(null);
  expect(viewer.boxHere.get()).toBe(null);
});

test('moving off the Image of a pending Box waits on it', async () => {
  const { viewer } = await selecting(1);
  viewer.open(S11);
  await settle();
  viewer.setBox(BOX);
  viewer.show(19);
  expect(viewer.leaving.get()).toBe(true);
  expect(viewer.image.get()).toBe(18);
  await viewer.answer('keep');
  viewer.changeVolume(CHOICE_202);
  expect(viewer.leaving.get()).toBe(true);
  await viewer.answer('discard');
  expect(viewer.pending.get()).toBe(null);
  expect(viewer.volume.get()?.id).toBe('202');
  // Nothing pending, the Image shown is no way out.
  viewer.show(3);
  expect(viewer.leaving.get()).toBe(false);
  expect(viewer.image.get()).toBe(3);
});

test('a way out waits on the pending change: kept, discarded or saved', async () => {
  const { api, viewer } = await selecting(2);
  const vision = { citation: C21, link: VISION_21 };
  viewer.open(vision);
  await settle();
  viewer.editBox();
  viewer.close();
  expect(viewer.leaving.get()).toBe(true);
  expect(viewer.source.get()?.citation.id).toBe(21);

  await viewer.answer('keep');
  expect(viewer.leaving.get()).toBe(false);
  expect(viewer.pending.get()).not.toBe(null);

  viewer.close();
  await viewer.answer('discard');
  expect(viewer.source.get()).toBe(null);

  viewer.open(vision);
  await settle();
  viewer.editBox();
  viewer.close();
  await viewer.answer('save');
  expect(api.asked).toContain('mark 21 201/18 box');
  expect(viewer.source.get()).toBe(null);
  expect(viewer.pending.get()).toBe(null);
});

test('leaving runs at once with nothing pending, and keeping on editing runs `stay`', async () => {
  const { viewer } = await selecting(1);
  const ran: string[] = [];
  viewer.open(S11);
  await settle();
  viewer.leave(() => {
    ran.push('go');
  });
  viewer.setBox(BOX);
  viewer.leave(
    () => {
      ran.push('go');
    },
    () => {
      ran.push('stay');
    }
  );
  expect(ran).toEqual(['go']);
  await viewer.answer('keep');
  expect(ran).toEqual(['go', 'stay']);
});

test('a refused save leaves the way out waiting', async () => {
  const { viewer } = await selecting(1);
  viewer.open(S13);
  await settle();
  viewer.setBox(BOX);
  viewer.open(S11);
  const refused = await viewer
    .answer('save')
    .then(() => null)
    .catch((err: unknown) => err);
  expect(refused).toBeInstanceOf(ApiError);
  expect(viewer.leaving.get()).toBe(true);
  expect(viewer.source.get()).toEqual(S13);
});

test('selecting someone else drops the pending change', async () => {
  const { state, viewer } = await selecting(1);
  viewer.open(S11);
  await settle();
  viewer.setBox(BOX);
  state.select(2);
  expect(viewer.source.get()).toBe(null);
  expect(viewer.pending.get()).toBe(null);
  expect(viewer.leaving.get()).toBe(false);
});

test("editing a Vision match's Box starts from it, and Save sends the Box", async () => {
  const { api, viewer } = await selecting(2);
  viewer.open({ citation: C21, link: VISION_21 });
  await settle();
  expect(viewer.boxHere.get()).toEqual(BOX);
  expect(viewer.boxPending.get()).toBe(false);
  viewer.editBox();
  expect(viewer.pending.get()).toEqual({
    volumeId: '201',
    volume: 'I Aa:201',
    image: 18,
    box: BOX
  });
  expect(viewer.boxPending.get()).toBe(true);
  const moved = { ...BOX, top: 0.6 };
  viewer.setBox(moved);
  expect(viewer.boxHere.get()).toEqual(moved);
  await viewer.save();
  expect(api.asked).toContain('mark 21 201/18 box');
});

test('a Discard waits to be saved, and takes the Box back where it is', async () => {
  const { api, viewer } = await selecting(2);
  viewer.open({ citation: C21, link: VISION_21 });
  await settle();
  viewer.discard();
  expect(viewer.discarding.get()).toBe(true);
  viewer.cancel();
  expect(viewer.discarding.get()).toBe(false);
  expect(viewer.source.get()?.link).toEqual(VISION_21);
  viewer.discard();
  await viewer.confirmDiscard();
  expect(api.asked.slice(-3)).toEqual([
    'discard 21 201/18',
    'links 2',
    'citations 201'
  ]);
  expect(viewer.discarding.get()).toBe(false);
  expect(viewer.source.get()?.link).toEqual(onImage('201', 20));
  // The viewer stays where the Box was.
  expect(viewer.image.get()).toBe(18);
});

test('a Discard needs a Box, and moving off its Image drops it', async () => {
  const { state, viewer } = await selecting(1);
  viewer.open(S11);
  await settle();
  viewer.discard();
  expect(viewer.discarding.get()).toBe(false);
  state.select(2);
  await settle();
  viewer.open({ citation: C21, link: VISION_21 });
  await settle();
  viewer.discard();
  viewer.show(19);
  expect(viewer.leaving.get()).toBe(false);
  expect(viewer.discarding.get()).toBe(false);
  viewer.show(18);
  viewer.discard();
  // Editing the Box instead drops it too.
  viewer.editBox();
  expect(viewer.discarding.get()).toBe(false);
  expect(viewer.boxPending.get()).toBe(true);
});

test('a Box drawn on another Image moves the source there', async () => {
  const { viewer } = await selecting(1);
  viewer.open(S11);
  await settle();
  viewer.show(22);
  viewer.setBox(BOX);
  expect(viewer.pending.get()).toEqual({
    volumeId: '201',
    volume: 'I Aa:201',
    image: 22,
    box: BOX
  });
});
