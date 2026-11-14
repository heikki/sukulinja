// Editing an Entry from its Box in the Scan viewer (ADR-0026): its people,
// what it says and its Box changed at once in the card it was made in, and
// the whole Entry deleted. Over the app's own server, so what's checked is
// the Entry as it is after.

import { afterEach, beforeEach, expect, test } from 'bun:test';

import type { DatasetApi } from '@/client/dataset-api';
import { servedDataset } from '@/client/dataset-api/served';
import type { VolumeCitation } from '@/common/types';
import {
  baptismCitation,
  juvaAstia,
  VOLUMES
} from '@/server/citations/testing';

import { openAppState } from './';

// Juva's baptisms, under an id like Astia's own.
const VOLUME = '203';
const BOX = { left: 100, top: 200, width: 500, height: 50 };

// Made-up people: a child (1), their mother (2), another woman (3) and a
// man (4).
const GEDCOM = [
  '0 @I1@ INDI',
  '1 NAME Juho /Esimerkki/',
  '0 @I2@ INDI',
  '1 NAME Maria /Esimerkki/',
  '0 @I3@ INDI',
  '1 NAME Liisa /Malli/',
  '0 @I4@ INDI',
  '1 NAME Matti /Malli/',
  ''
].join('\n');

let served: Awaited<ReturnType<typeof servedDataset>> | null = null;
let api: DatasetApi | null = null;

beforeEach(async () => {
  served = await servedDataset(
    GEDCOM,
    juvaAstia(undefined, { [VOLUME]: VOLUMES['juva-3'] }),
    {
      // The mother's own baptism, as MyHeritage gave it.
      seed({ db }) {
        const { page, text } = baptismCitation(9001, '3. Maalis 1765', 'Maria');
        db.run(
          `INSERT INTO citations (scope_type, scope_id, page, text, sort_order)
           VALUES ('person', 2, ?, ?, 0)`,
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

// The Entry's Citations, as the Volume's citations list them now.
async function entryNow(entryId: number) {
  const rows = await api!.volumeCitations(VOLUME);
  return rows
    .filter((r) => r.citation.entryId === entryId)
    .map((r) => ({
      personId: r.personId,
      role: r.citation.role,
      text: r.citation.text,
      image: 'image' in r.link ? r.link.image : null,
      box: 'box' in r.link ? r.link.box : null
    }));
}

// The child selected, open on their Citation of an Entry on Image 12,
// which names their mother too.
async function viewing() {
  const made = await api!.citeEntry(
    {
      volumeId: VOLUME,
      image: 12,
      fileId: `${VOLUME}-f12`,
      box: BOX,
      text: 'Kaste 1.2.1790'
    },
    [
      { personId: 1, role: 'CHIL' },
      { personId: 2, role: 'MOTH' }
    ]
  );
  const child = made[0]!;
  const state = openAppState(api!);
  state.chart.select(1);
  await until(() => state.selected.details.get() !== null);
  state.viewer.open({ citation: child.citation, link: child.link });
  await until(() => Array.isArray(state.viewer.citations.get()));
  return { viewer: state.viewer, child, entryId: child.citation.entryId! };
}

test('editing starts from the Entry as it is, and Cancel leaves it so', async () => {
  const { viewer, child, entryId } = await viewing();
  viewer.editEntry();
  expect(viewer.pending.get()?.cite).toMatchObject({
    people: [
      { personId: 1, role: 'CHIL' },
      { personId: 2, role: 'MOTH' }
    ],
    text: 'Kaste 1.2.1790',
    editing: { entryId }
  });
  expect(viewer.boxPending.get()).toBe(true);
  viewer.cancel();
  expect(viewer.pending.get()).toBeNull();
  expect(viewer.source.get()?.citation.id).toBe(child.citation.id);
  expect(await entryNow(entryId)).toMatchObject([
    { personId: 1, text: 'Kaste 1.2.1790', box: BOX },
    { personId: 2, text: 'Kaste 1.2.1790', box: BOX }
  ]);
});

test('one Save adds, takes out, says and moves, and stays on the source', async () => {
  const { viewer, child, entryId } = await viewing();
  viewer.editEntry();
  viewer.entryForm.setInEntry({ personId: 3, role: 'MOTH' });
  viewer.entryForm.setInEntry({ personId: 4, role: 'FATH' });
  viewer.entryForm.setText('Kaste 2.2.1790');
  const moved = { ...BOX, top: 260 };
  viewer.setBox(moved);
  expect(await viewer.save()).toBeNull();

  const after = { text: 'Kaste 2.2.1790', image: 12, box: moved };
  expect(await entryNow(entryId)).toEqual([
    { personId: 1, role: 'CHIL', ...after },
    { personId: 3, role: 'MOTH', ...after },
    { personId: 4, role: 'FATH', ...after }
  ]);
  expect(viewer.pending.get()).toBeNull();
  expect(viewer.source.get()).toMatchObject({
    citation: { id: child.citation.id },
    link: { box: moved }
  });
  await until(() => viewer.entry.people.get().length === 3);
  expect(viewer.entry.people.get().map((r) => r.personId)).toEqual([1, 3, 4]);
});

test("a Role changed keeps the person's Citation, and the viewer on it", async () => {
  const { viewer, child, entryId } = await viewing();
  viewer.editEntry();
  viewer.entryForm.setPeople([
    { personId: 1, role: 'FATH' },
    { personId: 2, role: 'MOTH' }
  ]);
  await viewer.save();
  const rows: VolumeCitation[] = await api!.volumeCitations(VOLUME);
  expect(
    rows
      .filter((r) => r.citation.entryId === entryId)
      .map((r) => [r.citation.id, r.citation.role])
  ).toEqual([
    [child.citation.id, 'FATH'],
    [child.citation.id + 1, 'MOTH']
  ]);
  expect(viewer.source.get()?.citation.id).toBe(child.citation.id);
});

test("taking the source's own person out leaves the viewer on the Image", async () => {
  const { viewer, entryId } = await viewing();
  viewer.editEntry();
  viewer.entryForm.drop(1);
  await viewer.save();
  expect(await entryNow(entryId)).toMatchObject([{ personId: 2, box: BOX }]);
  expect(viewer.source.get()).toBeNull();
  expect(viewer.opened.get()).toEqual({
    volumeId: VOLUME,
    volume: VOLUMES['juva-3'],
    image: 12
  });
});

test('an edit refused changes nothing', async () => {
  const { viewer, entryId } = await viewing();
  viewer.editEntry();
  viewer.entryForm.drop(1);
  viewer.entryForm.drop(2);
  expect(await viewer.save().catch((err: unknown) => err)).toMatchObject({
    message: 'Name someone in the entry.'
  });
  // Someone with a Citation of another entry on the Image.
  await api!.citeEntry(
    {
      volumeId: VOLUME,
      image: 12,
      fileId: `${VOLUME}-f12`,
      box: { ...BOX, top: 400 },
      text: null
    },
    [{ personId: 4, role: 'CHIL' }]
  );
  viewer.cancel();
  viewer.editEntry();
  viewer.entryForm.setText('Kaste 2.2.1790');
  viewer.entryForm.setInEntry({ personId: 4, role: 'FATH' });
  expect(await viewer.save().catch((err: unknown) => err)).toMatchObject({
    message: 'Their Citations already link this Image.'
  });
  expect(await entryNow(entryId)).toMatchObject([
    { personId: 1, text: 'Kaste 1.2.1790' },
    { personId: 2, text: 'Kaste 1.2.1790' }
  ]);
});

test('deleting the Box of an Entry with others in it deletes the Entry', async () => {
  const { viewer, entryId } = await viewing();
  viewer.discard();
  await viewer.confirmDiscard();
  // No one cites the Volume now.
  expect(
    served!
      .db()
      .query('SELECT id FROM citations WHERE entry_id = ?')
      .all(entryId)
  ).toEqual([]);
  expect(viewer.source.get()).toBeNull();
});

test("whom the edited Entry can't name: those named, and those with another Citation linking its Image", async () => {
  const { viewer, child } = await viewing();
  // The mother's own baptism marked on the Image too, as a confirmation
  // beside the scan does.
  const [own] = (await api!.person(2)).citations;
  await viewer.confirm({ citation: own!, link: child.link });
  await until(() => {
    const rows = viewer.citations.get();
    return Array.isArray(rows) && rows.some((r) => r.citation.id === own!.id);
  });
  viewer.editEntry();
  expect([...viewer.entryForm.notNamable.get()].sort((a, b) => a - b)).toEqual([
    1, 2
  ]);
  // Taken out, she's still refused for her other Citation; someone else
  // taken out isn't.
  viewer.entryForm.setInEntry({ personId: 3, role: 'FATH' });
  viewer.entryForm.drop(2);
  viewer.entryForm.drop(3);
  expect([...viewer.entryForm.notNamable.get()].sort((a, b) => a - b)).toEqual([
    1, 2
  ]);
});

test('someone named with no Role in a baptism can still be given one', async () => {
  const { viewer } = await viewing();
  viewer.editEntry();
  viewer.entryForm.setInEntry({ personId: 3, role: null });
  expect(viewer.entryForm.notNamable.get().has(3)).toBe(false);
  viewer.entryForm.setInEntry({ personId: 3, role: 'FATH' });
  expect(viewer.entryForm.notNamable.get().has(3)).toBe(true);
});
