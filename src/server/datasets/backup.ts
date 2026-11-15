// A copy of a dataset's database as it is now, taken before a large
// Proposal is applied (ADR-0025): `backups/<time>.sqlite` beside it. It's
// the whole database, Changes and all, but not the media folder, which no
// Proposal touches. Putting one back is replacing db.sqlite with it while
// the app is closed.

import type { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

// Copies the database into its backups folder, and says where.
export function backUp(db: Database, now = new Date()) {
  const dir = join(dirname(db.filename), 'backups');
  mkdirSync(dir, { recursive: true });
  const stamp = now.toISOString().replace(/[:.]/gu, '-');
  const path = join(dir, `${stamp}.sqlite`);
  db.prepare('VACUUM INTO ?').run(path);
  return path;
}
