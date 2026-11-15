import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { backUp } from './backup';
import { openDb } from './db';

test('copies the whole database beside it, as it is now', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'backup-'));
  try {
    const db = openDb(join(dir, 'db.sqlite'));
    db.run("INSERT INTO persons (id, xref) VALUES (1, '@I1@')");
    const path = backUp(db, new Date('2026-11-15T12:00:00.000Z'));
    expect(path).toBe(join(dir, 'backups', '2026-11-15T12-00-00-000Z.sqlite'));
    db.run('DELETE FROM persons');
    const copy = new Database(path, { readonly: true });
    expect(copy.query('SELECT id FROM persons').all()).toEqual([{ id: 1 }]);
    copy.close();
    db.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
