import type { Database } from 'bun:sqlite';

// The dataset's version: it changes with every write to it, from this
// connection or another.
export function datasetVersion(db: Database) {
  const { changes } = db
    .query<{ changes: number }, []>('SELECT total_changes() AS changes')
    .get()!;
  const { data_version: other } = db
    .query<{ data_version: number }, []>('PRAGMA data_version')
    .get()!;
  return `${other}.${changes}`;
}
