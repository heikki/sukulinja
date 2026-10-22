// Once: renames `imported_page` to `original_page` in a data folder's
// datasets (ADR-0013), moving each schema 5 database to schema 6 in place.

import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Database } from 'bun:sqlite';

const FILES = ['db.sqlite', 'db.before-import.sqlite'];

function schemaOf(db: Database) {
  const row = db
    .query<{ value: string }, []>(
      "SELECT value FROM meta WHERE key = 'schema_version'"
    )
    .get();
  return row === null ? null : Number(row.value);
}

// What renaming the column in one database did.
function renameIn(path: string) {
  let db: Database | null = null;
  try {
    db = new Database(path, { readwrite: true });
    const schema = schemaOf(db);
    if (schema !== 5) return `left at schema ${schema ?? 'unknown'}`;
    const open = db;
    open.transaction(() => {
      open.run(
        'ALTER TABLE citations RENAME COLUMN imported_page TO original_page'
      );
      open.run("UPDATE meta SET value = '6' WHERE key = 'schema_version'");
    })();
    return 'renamed';
  } catch (err) {
    return `not read: ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    db?.close();
  }
}

// Each dataset database in the folder, with what renaming did to it.
export async function renameOriginalPage(root: string) {
  const entries = await readdir(root, { withFileTypes: true });
  const out: Array<{ path: string; result: string }> = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    for (const file of FILES) {
      const path = join(root, entry.name, file);
      if (existsSync(path)) out.push({ path, result: renameIn(path) });
    }
  }
  return out;
}
