import type { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { CitationRow } from '@/common/types';

import { openDb } from '../datasets/db';
import { openChanges } from './changes';

const CITATION: CitationRow = {
  id: 11,
  source: 'Juvan seurakunnan arkisto',
  reference: 'I Aa:1, s. 12',
  entry: null,
  page: null,
  url: null,
  record: null,
  text: null,
  churchBook: true,
  madeInApp: false,
  markKey: 'citation 11',
  citedPage: null,
  cited: null,
  supports: [],
  transcribed: []
};

// A dataset with Matti, named twice, and his citation 11.
async function dataset() {
  const dir = await mkdtemp(join(tmpdir(), 'changes-'));
  const db = openDb(join(dir, 'db.sqlite'));
  db.run("INSERT INTO persons (id, xref) VALUES (1, '@I1@')");
  db.run(
    `INSERT INTO names (person_id, full_text, sort_order)
     VALUES (1, 'Matti /Esimerkki/', 0), (1, 'Matthias /Exempli/', 1)`
  );
  db.run(
    `INSERT INTO citations (id, scope_type, scope_id, sort_order)
     VALUES (11, 'person', 1, 0)`
  );
  return db;
}

function changesOf(db: Database) {
  return openChanges(db, {
    citationOf: (id) => {
      const row = db
        .query<{ id: number }, [number]>(
          'SELECT id FROM citations WHERE id = ?'
        )
        .get(id);
      return row === null ? null : { personId: 1, citation: CITATION };
    },
    replaced: async () => await Promise.resolve(false)
  });
}

const DISCARD = {
  kind: 'discard',
  volume: 'I Aa:1',
  image: 12,
  rejection: false
} as const;

test('lists each Change newest first, with what it was on and who that was', async () => {
  const db = await dataset();
  const changes = changesOf(db);
  changes.add({ on: { citationId: 11 }, what: DISCARD });
  changes.add({ on: null, what: { kind: 'undo-import' } });

  expect(await changes.list()).toMatchObject([
    { what: { kind: 'undo-import' }, on: null, who: null },
    {
      what: DISCARD,
      on: { kind: 'citation', personId: 1, citationId: 11 },
      who: 'Matti /Esimerkki/'
    }
  ]);
});

test("one on a Photo is on it, and once it's gone, on its person", async () => {
  const db = await dataset();
  db.run("INSERT INTO media (id, file_path) VALUES (10, 'kesa.jpg')");
  const changes = changesOf(db);
  const untag = { kind: 'untag', photo: 'kesa.jpg' } as const;
  changes.add({ on: { personId: 1, photoId: 10 }, what: untag });
  changes.add({ on: { personId: 1, photoId: 99 }, what: untag });

  expect((await changes.list()).map((c) => c.on)).toEqual([
    { kind: 'person', personId: 1 },
    { kind: 'photo', personId: 1, photoId: 10 }
  ]);
  db.run('DELETE FROM media WHERE id = 10');
  expect((await changes.list())[1]!.on).toEqual({
    kind: 'person',
    personId: 1
  });
});

test("one on a Citation that's gone is its person's; one whose person is gone is on nothing, and says who", async () => {
  const db = await dataset();
  const changes = changesOf(db);
  changes.add({ on: { citationId: 11 }, what: DISCARD });
  changes.add({ on: { personId: 9 }, what: DISCARD });

  db.run('DELETE FROM citations WHERE id = 11');
  expect((await changes.list())[1]!.on).toEqual({
    kind: 'person',
    personId: 1
  });
  db.run('DELETE FROM persons WHERE id = 1');
  expect(await changes.list()).toMatchObject([
    { on: null, who: null },
    { on: null, who: 'Matti /Esimerkki/' }
  ]);
});

test('one like the newest, on the same thing, takes its place', async () => {
  const db = await dataset();
  db.run("INSERT INTO media (id, file_path) VALUES (10, 'kesa.jpg')");
  const changes = changesOf(db);
  const onTag = { personId: 1, photoId: 10 };
  function tag(moved: boolean) {
    return { kind: 'tag', photo: 'kesa.jpg', moved } as const;
  }
  changes.add({ on: onTag, what: tag(false) });
  changes.add({ on: onTag, what: tag(true) });
  changes.add({ on: onTag, what: tag(true) });

  const list = await changes.list();
  expect(list).toHaveLength(1);
  expect(list[0]!.what).toEqual(tag(true));
});

test('a Fact edited again and again shows as its last edit', async () => {
  const db = await dataset();
  const changes = changesOf(db);
  function fact(did: 'add' | 'edit', was: string | null, now: string) {
    return { kind: 'fact', did, tag: 'BIRT', was, now } as const;
  }
  changes.add({ on: { personId: 1 }, what: fact('add', null, '1771') });
  changes.add({ on: { personId: 1 }, what: fact('edit', '1771', '1772') });
  changes.add({ on: { personId: 1 }, what: fact('edit', '1772', '1773') });

  expect((await changes.list()).map((c) => c.what)).toEqual([
    fact('edit', '1772', '1773'),
    fact('add', null, '1771')
  ]);
});

test('stays apart from one of another kind, on something else, or with one between', async () => {
  const db = await dataset();
  db.run("INSERT INTO media (id, file_path) VALUES (10, 'kesa.jpg')");
  const changes = changesOf(db);
  const tag = { kind: 'tag', photo: 'kesa.jpg', moved: true } as const;
  const birth = { kind: 'fact', did: 'edit', tag: 'BIRT' } as const;
  changes.add({ on: { personId: 1, photoId: 10 }, what: tag });
  changes.add({ on: { personId: 1 }, what: { ...birth, was: 'a', now: 'b' } });
  // Another Fact of the same tag: it didn't read as the last one left it.
  changes.add({ on: { personId: 1 }, what: { ...birth, was: 'x', now: 'y' } });
  changes.add({ on: { personId: 1, photoId: 10 }, what: tag });
  changes.add({ on: { citationId: 11 }, what: DISCARD });
  changes.add({ on: { citationId: 11 }, what: DISCARD });

  expect(await changes.list()).toHaveLength(6);
});
