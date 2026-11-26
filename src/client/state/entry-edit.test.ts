// Editing an Entry from its Box in the Scan viewer (ADR-0026): its people,
// what it says and its Box changed at once in the Entry pane it was made in, and
// the whole Entry deleted. Over the app's own server, so what's checked is
// the Entry as it is after.

import { afterEach, beforeEach, expect, test } from 'bun:test';

import type { DatasetApi } from '@/client/dataset-api';
import { servedDataset } from '@/client/dataset-api/served';
import { NO_FIELDS } from '@/common/entry-events';
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
      event: 'CHR',
      text: 'Kaste 1.2.1790',
      fields: NO_FIELDS,
      ticked: []
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
  expect(viewer.pending.get()).toMatchObject({
    kind: 'edit',
    cite: {
      people: [
        { personId: 1, role: 'CHIL' },
        { personId: 2, role: 'MOTH' }
      ],
      text: 'Kaste 1.2.1790'
    },
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
    { personId: 1, role: 'CHIL' },
    { personId: 2, role: 'FATH' }
  ]);
  expect(viewer.entryForm.anew.get()).toBe(false);
  await viewer.save();
  const rows: VolumeCitation[] = await api!.volumeCitations(VOLUME);
  expect(
    rows
      .filter((r) => r.citation.entryId === entryId)
      .map((r) => [r.citation.id, r.citation.role])
  ).toEqual([
    [child.citation.id, 'CHIL'],
    [child.citation.id + 1, 'FATH']
  ]);
  expect(viewer.source.get()?.citation.id).toBe(child.citation.id);
});

test('another child saves a new Entry in place of it, the viewer on the Image (ADR-0037)', async () => {
  const { viewer, entryId } = await viewing();
  viewer.editEntry();
  viewer.entryForm.unlock('owner');
  viewer.entryForm.setInEntry({ personId: 3, role: 'CHIL' });
  expect(viewer.entryForm.anew.get()).toBe(true);
  await viewer.save();
  expect(await entryNow(entryId)).toEqual([]);
  const rows = await api!.volumeCitations(VOLUME);
  expect(
    rows
      .filter((r) => r.citation.entryId !== null)
      .map((r) => [r.personId, r.citation.role, r.citation.text])
  ).toEqual([
    [2, 'MOTH', 'Kaste 1.2.1790'],
    [3, 'CHIL', 'Kaste 1.2.1790']
  ]);
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
      event: 'CHR',
      text: null,
      fields: NO_FIELDS,
      ticked: []
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

test('a source retyped in Sources is edited from what it says now', async () => {
  const { viewer, child } = await viewing();
  await viewer.retext(child.citation.id, 'Kaste 2.2.1790');
  expect(viewer.source.get()?.citation.text).toBe('Kaste 2.2.1790');
  viewer.editEntry();
  expect(viewer.pending.get()).toMatchObject({
    cite: { text: 'Kaste 2.2.1790' }
  });
});

test('a Citation of the Entry deleted in Sources goes from beside the scan', async () => {
  const { viewer, entryId } = await viewing();
  const mother = await entryNow(entryId);
  expect(mother.map((r) => r.personId)).toEqual([1, 2]);
  const rows = viewer.citations.get() as VolumeCitation[];
  const theirs = rows.find((r) => r.personId === 2)!;
  await viewer.uncite(theirs.citation.id);
  expect(
    (viewer.citations.get() as VolumeCitation[]).map((r) => r.personId)
  ).toEqual([1]);
  expect(viewer.source.get()).not.toBeNull();
});

test("the Entry pane lists what the Entry's dates would do, and Save does those ticked", async () => {
  const { viewer, child, entryId } = await viewing();
  viewer.editEntry();
  const form = viewer.entryForm;
  form.setField('lifeDate', '30.1.1790');
  form.setField('date', '1.2.1790');
  form.setField('place', 'Esimerkkilä 2');
  await until(() => form.offers.get().length === 2);
  expect(form.offers.get()).toMatchObject([
    { tag: 'BIRT', action: 'add', now: { date: '30 JAN 1790' } },
    { tag: 'CHR', action: 'add', now: { date: '1 FEB 1790' } }
  ]);
  form.setTick('CHR add', false);
  await viewer.save();

  const details = await api!.person(1);
  const facts = details.facts.map((f) => [f.tag, f.date]);
  expect(facts).toEqual([['BIRT', '30 JAN 1790']]);
  const cited = details.citations.find((c) => c.id === child.citation.id);
  expect(cited?.supports).toEqual([details.facts[0]!.id]);
  expect(cited?.fields).toEqual({
    date: '1 FEB 1790',
    lifeDate: '30 JAN 1790',
    place: 'Esimerkkilä 2',
    // The Image's page, which the pane started from.
    page: 12
  });

  // Opened again: the Birth agrees now, the Christening is still to add.
  viewer.editEntry();
  expect(viewer.pending.get()).toMatchObject({
    cite: { fields: { lifeDate: '30.1.1790', date: '1.2.1790' } },
    editing: { entryId }
  });
  await until(() => form.offers.get()[0]?.action === 'support');
  expect(form.offers.get().map((o) => [o.tag, o.action])).toEqual([
    ['BIRT', 'support'],
    ['CHR', 'add']
  ]);
});

test("a date the Entry pane can't read is refused on Save, saying how to write it", async () => {
  const { viewer } = await viewing();
  viewer.editEntry();
  viewer.entryForm.setField('lifeDate', 'maaliskuussa');
  expect(viewer.save()).rejects.toThrow(/^Born: write the date as 3\.3\.1761/);
});

test('someone new named in the Entry pane is made with the Entry, and only then', async () => {
  const { viewer, entryId } = await viewing();
  viewer.editEntry();
  const form = viewer.entryForm;
  const id = form.nameNew({ given: 'Antti', surname: 'Malli', sex: 'U' });
  form.setInEntry({ personId: id, role: 'FATH' });
  // One named and taken out again is left out.
  form.nameNew({ given: 'Ei', surname: 'Ketään', sex: 'U' });
  expect((await api!.persons()).length).toBe(4);
  await viewer.save();

  const persons = await api!.persons();
  const father = persons.find((p) => p.given === 'Antti');
  expect(persons.length).toBe(5);
  expect(father?.sex).toBe('M');
  expect(await entryNow(entryId)).toMatchObject([
    { personId: 1, role: 'CHIL' },
    { personId: 2, role: 'MOTH' },
    { personId: father!.id, role: 'FATH' }
  ]);
  const families = await api!.families();
  expect(families).toMatchObject([{ husband_id: father!.id, child_ids: [1] }]);
});

test('a save after the tree changed under its lines is refused, those shown being what is saved (ADR-0037)', async () => {
  const { viewer, entryId } = await viewing();
  viewer.editEntry();
  viewer.entryForm.setField('lifeDate', '1.2.1790');
  await until(() => viewer.entryForm.offers.get().length > 0);
  // Meanwhile the tree changes: the mother's own baptism retyped.
  const own = (await api!.person(2)).citations.find((c) => c.entryId === null);
  await api!.retext(own!.id, 'Maria, kastettu');
  expect(await viewer.save().catch((err: unknown) => err)).toMatchObject({
    message: 'The tree has changed since; look at the list again.'
  });
  expect(await entryNow(entryId)).toMatchObject([
    { personId: 1, text: 'Kaste 1.2.1790' },
    { personId: 2, text: 'Kaste 1.2.1790' }
  ]);
  // Listed again, the next save is as they say.
  await viewer.save();
  expect(viewer.pending.get()).toBeNull();
});
