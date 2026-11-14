// Citing an entry from the Scan viewer, with a source or none: a pending
// Box for someone's new Citation, saved and opened, or cancelled, and
// deleting a Citation made in the app. Over the app's own server, so
// what's checked is the dataset's Entries after.

import { afterEach, beforeEach, expect, test } from 'bun:test';

import type { DatasetApi } from '@/client/dataset-api';
import { servedDataset } from '@/client/dataset-api/served';
import type { CitationRow, Link } from '@/common/types';
import { juvaAstia, rippiCitation, VOLUMES } from '@/server/citations/testing';

import { openAppState } from './';

// Juva's first rippikirja, under an id like Astia's own.
const VOLUME = '201';
const VOLUME_LABEL = VOLUMES['juva-1'];
const BOX = { left: 100, top: 200, width: 500, height: 50 };

// Made-up people: Matti (1), with a rippikirja reference Estimated on
// Image 12, and Juho (2).
const GEDCOM = [
  '0 @I1@ INDI',
  '1 NAME Matti /Esimerkki/',
  '0 @I2@ INDI',
  '1 NAME Juho /Esimerkki/',
  ''
].join('\n');

let served: Awaited<ReturnType<typeof servedDataset>> | null = null;
let api: DatasetApi | null = null;

beforeEach(async () => {
  served = await servedDataset(
    GEDCOM,
    juvaAstia(undefined, { [VOLUME]: VOLUME_LABEL }),
    {
      seed({ db }) {
        const { page, text } = rippiCitation(5001, '1790 - 1796', 12);
        db.run(
          `INSERT INTO citations (scope_type, scope_id, page, text, sort_order)
           VALUES ('person', 1, ?, ?, 0)`,
          [page, text]
        );
      }
    }
  );
  ({ api } = served);
});

afterEach(async () => {
  await served?.close();
});

async function until(done: () => boolean) {
  for (let i = 0; i < 200 && !done(); i += 1) {
    // eslint-disable-next-line no-await-in-loop -- until the state settles
    await Bun.sleep(5);
  }
}

// The Citations made in the app in the Volume, by whose, where and what
// they say.
async function madeNow() {
  const rows = await api!.volumeCitations(VOLUME).catch(() => []);
  return rows
    .filter((r) => r.citation.madeInApp)
    .map((r) => ({
      personId: r.personId,
      text: r.citation.text,
      image: 'image' in r.link ? r.link.image : null,
      box: 'box' in r.link ? r.link.box : null
    }));
}

// Matti selected, his reference open on Image 12.
async function viewing() {
  const state = openAppState(api!);
  state.chart.select(1);
  await until(() => state.selected.details.get() !== null);
  const [reference] = (await api!.person(1)).citations;
  const link: Link = (await api!.volumeCitations(VOLUME))[0]!.link;
  const source = { citation: reference!, link };
  state.viewer.open(source);
  await until(() => Array.isArray(state.viewer.citations.get()));
  return { state, viewer: state.viewer, reference: reference! };
}

test('a pending Citation is saved for its person, with its text, and opens', async () => {
  const { state, viewer } = await viewing();
  viewer.newEntry(BOX, [{ personId: 2, role: null }]);
  expect(viewer.boxHere.get()).toEqual(BOX);
  expect(viewer.boxPending.get()).toBe(true);
  const moved = { ...BOX, top: 260 };
  viewer.setBox(moved);
  viewer.entryForm.setText('  Baptism 12.3.1795 ');
  expect(viewer.pending.get()).toMatchObject({
    kind: 'new',
    cite: {
      people: [{ personId: 2, role: null }],
      text: '  Baptism 12.3.1795 '
    }
  });

  await state.chart.save();
  expect(await madeNow()).toEqual([
    { personId: 2, text: 'Baptism 12.3.1795', image: 12, box: moved }
  ]);
  expect(viewer.pending.get()).toBeNull();
  // Made for Juho, who's selected, the viewer on it.
  expect(state.selected.id.get()).toBe(2);
  expect(viewer.source.get()?.citation.madeInApp).toBe(true);
  expect(viewer.image.get()).toBe(12);
});

test("a pending entry's Role goes to whoever is named in it, and someone taken out leaves it", async () => {
  const { viewer } = await viewing();
  viewer.newEntry(BOX, [
    { personId: 1, role: 'CHIL' },
    { personId: 2, role: 'FATH' }
  ]);
  viewer.entryForm.setInEntry({ personId: 3, role: 'FATH' });
  viewer.entryForm.drop(1);
  expect(viewer.pending.get()).toMatchObject({
    cite: { people: [{ personId: 3, role: 'FATH' }] }
  });
  viewer.entryForm.drop(3);
  const refused = await viewer.save().catch((err: unknown) => err);
  expect(refused).toMatchObject({ message: 'Name someone in the entry.' });
  expect(await madeNow()).toEqual([]);
});

test('a pending Citation without text is saved with none, and Cancel leaves nothing', async () => {
  const { viewer, reference } = await viewing();
  viewer.newEntry(BOX, [{ personId: 2, role: null }]);
  viewer.cancel();
  expect(viewer.pending.get()).toBeNull();
  expect(viewer.source.get()?.citation.id).toBe(reference.id);

  viewer.show(14);
  await until(() => viewer.image.get() === 14);
  viewer.newEntry(BOX, [{ personId: 1, role: null }]);
  expect(await viewer.save()).toBeNull();
  expect(await madeNow()).toEqual([
    { personId: 1, text: null, image: 14, box: BOX }
  ]);
  // Matti's own: the viewer opens on it, him still selected.
  expect(viewer.source.get()?.citation).toMatchObject({
    text: null,
    madeInApp: true
  });
});

test('a way out of a pending Citation waits to save it', async () => {
  const { viewer, reference } = await viewing();
  viewer.newEntry(BOX, [{ personId: 2, role: null }]);
  viewer.show(19);
  expect(viewer.leaving.get()).toBe(true);
  expect(viewer.image.get()).toBe(12);
  await viewer.answer('save');
  expect(await madeNow()).toEqual([
    { personId: 2, text: null, image: 12, box: BOX }
  ]);
  expect(viewer.image.get()).toBe(19);
  expect(viewer.source.get()?.citation.id).toBe(reference.id);
});

test('opened on an Image with no source, a new Citation is made and opens', async () => {
  const { viewer } = await viewing();
  viewer.openImage({ volumeId: VOLUME, volume: VOLUME_LABEL, image: 16 });
  await until(() => viewer.image.get() === 16);
  viewer.newEntry(BOX, [{ personId: 1, role: null }]);
  viewer.setBox({ ...BOX, top: 300 });
  expect(viewer.pending.get()).toMatchObject({
    image: 16,
    box: { top: 300 },
    cite: { people: [{ personId: 1 }] }
  });
  viewer.entryForm.setText('Baptism 1.2.1800');
  await viewer.save();
  expect(viewer.source.get()?.citation.text).toBe('Baptism 1.2.1800');
  expect(viewer.source.get()?.link).toMatchObject({ image: 16 });
  expect(viewer.pending.get()).toBeNull();
});

test('opened on an Image with no source, Cancel drops the pending Citation', async () => {
  const { viewer } = await viewing();
  viewer.openImage({ volumeId: VOLUME, volume: VOLUME_LABEL, image: 16 });
  await until(() => viewer.image.get() === 16);
  viewer.newEntry(BOX, [{ personId: 2, role: null }]);
  viewer.cancel();
  expect(viewer.pending.get()).toBeNull();
  expect(viewer.image.get()).toBe(16);
  expect(viewer.source.get()).toBeNull();
});

test('a Discard of a Citation made in the app deletes it, once confirmed', async () => {
  const [made] = await api!.citeEntry(
    {
      volumeId: VOLUME,
      image: 20,
      fileId: `${VOLUME}-f20`,
      box: BOX,
      text: null
    },
    [{ personId: 1, role: null }]
  );
  const { viewer } = await viewing();
  const citation: CitationRow = made!.citation;
  viewer.open({ citation, link: made!.link });
  await until(() => viewer.image.get() === 20);
  viewer.discard();
  expect(viewer.discarding.get()).toBe(true);
  viewer.cancel();
  expect(await madeNow()).toHaveLength(1);

  viewer.discard();
  await viewer.confirmDiscard();
  expect(await madeNow()).toEqual([]);
  expect(viewer.source.get()).toBeNull();
});
