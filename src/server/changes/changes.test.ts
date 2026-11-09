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
  cited: null
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
