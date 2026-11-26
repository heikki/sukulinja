// Placing a Church-book reference's entry in the Scan viewer: its Entry pane is
// an Entry's, as Edit's is (ADR-0026, ADR-0033). Its Mark makes it an
// Entry of everyone citing the record (ADR-0016), then the Entry is as the
// Entry pane says. Over the app's own server.

import { afterEach, beforeEach, expect, test } from 'bun:test';

import { ApiError } from '@/client/dataset-api';
import type { DatasetApi } from '@/client/dataset-api';
import { servedDataset } from '@/client/dataset-api/served';
import {
  baptismCitation,
  juvaAstia,
  VOLUMES
} from '@/server/citations/testing';

import { NO_TYPED, openAppState } from './';
import { recordTyped } from './entry-lines';

// Juva's baptisms, under an id like Astia's own.
const VOLUME = '203';
const BOX = { left: 100, top: 200, width: 500, height: 50 };

// Made-up people: a child (1) and their mother (2), who both cite the
// child's baptism as MyHeritage gave it.
const GEDCOM = [
  '0 @I1@ INDI',
  '1 NAME Juho /Esimerkki/',
  '1 CHR',
  '2 DATE 3 MAR 1795',
  '0 @I2@ INDI',
  '1 NAME Maria /Esimerkki/',
  '0 @F1@ FAM',
  '1 WIFE @I2@',
  '1 CHIL @I1@',
  ''
].join('\n');

let served: Awaited<ReturnType<typeof servedDataset>> | null = null;
let api: DatasetApi | null = null;

beforeEach(async () => {
  served = await servedDataset(
    GEDCOM,
    juvaAstia(undefined, { [VOLUME]: VOLUMES['juva-3'] }),
    {
      // The child's baptism, cited by both.
      seed({ db }) {
        const { page, text } = baptismCitation(9001, '3. Maalis 1795', 'Juho');
        for (const person of [1, 2]) {
          db.run(
            `INSERT INTO citations (scope_type, scope_id, page, text, sort_order)
             VALUES ('person', ?, ?, ?, 0)`,
            [person, page, text]
          );
        }
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

// The child selected, open on their reference, which links the Volume.
async function viewing() {
  const state = openAppState(api!);
  state.chart.select(1);
  await until(() => state.selected.details.get() !== null);
  const citation = state.selected.details.get()!.citations[0]!;
  const links = await linksOf(citation.id);
  state.viewer.open({ citation, link: links[0]! });
  await until(() => Array.isArray(state.viewer.citations.get()));
  return { state, viewer: state.viewer, citation };
}

async function linksOf(citationId: number) {
  for await (const found of api!.personLinks(1)) {
    if (found.citationId === citationId && 'links' in found) {
      return found.links;
    }
  }
  return [];
}

// Who the Volume's citations name, by Entry, Role and what it records.
async function citingNow() {
  const rows = await api!.volumeCitations(VOLUME);
  return rows.map((r) => ({
    personId: r.personId,
    entryId: r.citation.entryId,
    role: r.citation.role,
    event: r.citation.event,
    date: r.citation.fields?.date ?? null,
    box: 'box' in r.link ? r.link.box : null
  }));
}

async function refused(saving: Promise<unknown>, words: string) {
  const err: unknown = await saving.then(() => null).catch((e: unknown) => e);
  expect(err).toBeInstanceOf(ApiError);
  expect((err as ApiError).message).toContain(words);
}

const BOTH = [
  { personId: 1, role: 'CHIL' },
  { personId: 2, role: 'MOTH' }
];

test("Place entry's pane names the record's people and tells its kind, as Edit's does", async () => {
  const { viewer, citation } = await viewing();
  viewer.placeEntry(BOX, { event: 'CHR', people: BOTH, fields: NO_TYPED });
  expect(viewer.pending.get()).toMatchObject({
    kind: 'place',
    image: 1,
    box: BOX,
    cite: { event: 'CHR', people: BOTH, fields: NO_TYPED },
    named: [1, 2]
  });
  viewer.entryForm.setField('date', '3.3.1795');
  expect(await viewer.save()).toBeNull();

  const entryId = (await citingNow())[0]?.entryId ?? null;
  expect(entryId).not.toBeNull();
  const after = {
    entryId,
    event: 'CHR' as const,
    date: '3 MAR 1795',
    box: BOX
  };
  expect(await citingNow()).toEqual([
    { personId: 1, role: 'CHIL', ...after },
    { personId: 2, role: 'MOTH', ...after }
  ]);
  expect(viewer.pending.get()).toBeNull();
  expect(viewer.source.get()).toMatchObject({
    citation: { id: citation.id, entryId },
    link: { precision: 'entry', box: BOX }
  });
});

test('an Entry pane left as it starts saves only the Mark', async () => {
  const { viewer } = await viewing();
  viewer.placeEntry(BOX, { event: null, people: BOTH, fields: NO_TYPED });
  await viewer.save();
  const rows = await citingNow();
  expect(rows.map((r) => [r.personId, r.box])).toEqual([
    [1, BOX],
    [2, BOX]
  ]);
  expect(rows[0]?.entryId).not.toBeNull();
  expect(rows[0]?.entryId).toBe(rows[1]?.entryId ?? null);
  expect(viewer.pending.get()).toBeNull();
});

test('one taken out of the Entry pane goes from the Entry the Mark made', async () => {
  const { viewer } = await viewing();
  viewer.placeEntry(BOX, { event: 'CHR', people: BOTH, fields: NO_TYPED });
  viewer.entryForm.drop(2);
  await viewer.save();
  expect(await citingNow()).toMatchObject([
    { personId: 1, role: 'CHIL', box: BOX }
  ]);
});

test('an Entry pane that would be refused is refused before the Mark', async () => {
  const { viewer } = await viewing();
  viewer.placeEntry(BOX, { event: 'CHR', people: BOTH, fields: NO_TYPED });
  viewer.entryForm.setField('date', 'sometime');
  await refused(viewer.save(), 'write the date as');
  viewer.entryForm.setField('date', '');
  viewer.entryForm.drop(1);
  viewer.entryForm.drop(2);
  await refused(viewer.save(), 'Name someone in the entry.');
  expect((await citingNow()).map((r) => r.box)).toEqual([null, null]);
  expect(viewer.pending.get()).toMatchObject({ kind: 'place' });
});

test("the record's dates start the Entry pane, and the tree's Fact that agrees takes it as its source", async () => {
  const { state, viewer, citation } = await viewing();
  const fields = recordTyped('CHR', citation.record);
  expect(fields).toEqual({ date: '3.3.1795', lifeDate: '', place: '' });
  viewer.placeEntry(BOX, { event: 'CHR', people: BOTH, fields });
  await viewer.save();
  expect((await citingNow())[0]).toMatchObject({ date: '3 MAR 1795' });
  await until(
    () => (state.selected.details.get()?.citations[0]?.supports.length ?? 0) > 0
  );
  const details = state.selected.details.get()!;
  const christening = details.facts.find((f) => f.tag === 'CHR');
  expect(details.citations[0]?.supports).toEqual([christening!.id]);
  expect(details.facts.filter((f) => f.tag === 'CHR')).toHaveLength(1);
});

test("Edit of an Entry with no dates starts from its Transcription's, as Place entry does", async () => {
  const { state, viewer } = await viewing();
  viewer.placeEntry(BOX, { event: null, people: BOTH, fields: NO_TYPED });
  await viewer.save();
  await until(() => viewer.entry.kind.get() === 'entry');
  viewer.editEntry();
  expect(viewer.pending.get()).toMatchObject({
    kind: 'edit',
    cite: { fields: { date: '3.3.1795', lifeDate: '' } }
  });
  await viewer.save();
  await until(
    () => (state.selected.details.get()?.citations[0]?.supports.length ?? 0) > 0
  );
  const details = state.selected.details.get()!;
  const christening = details.facts.find((f) => f.tag === 'CHR');
  expect(details.citations[0]?.supports).toEqual([christening!.id]);
});

test("an edited Entry's lines know the Fact it supports from another of its kind", async () => {
  const { viewer } = await viewing();
  viewer.placeEntry(BOX, {
    event: 'CHR',
    people: BOTH,
    fields: { ...NO_TYPED, date: '3.3.1795' }
  });
  await viewer.save();
  const entryId = (await citingNow())[0]!.entryId!;
  // A second Christening, made by hand since.
  served!.db().run(
    `INSERT INTO facts (scope_type, scope_id, tag, date_text, sort_order)
     VALUES ('person', 1, 'CHR', '1796', 9)`
  );
  const asked = {
    volumeId: VOLUME,
    event: 'CHR' as const,
    people: BOTH,
    fields: { date: '3 MAR 1795', lifeDate: null, place: null }
  };
  // Asked anew, the one that agrees is offered; edited, it's kept.
  expect((await api!.entryOffers(asked)).offers).toMatchObject([
    { tag: 'CHR', action: 'support' }
  ]);
  expect((await api!.entryOffers({ ...asked, entryId })).offers).toMatchObject([
    { tag: 'CHR', action: 'support', kept: true }
  ]);
});
