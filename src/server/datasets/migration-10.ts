// Schema 10 (ADR-0030): what only a re-import into the dataset, or a
// Rejection, needed goes. An import only makes a new dataset (ADR-0021),
// and a Match discarded is only undone (ADR-0029): the Changes of an
// import undone are dropped, an import's no longer says whether it merged
// or what it lost, a Discard no longer whether it rejected a Match, and
// the Rejections are dropped.

import type { Database } from 'bun:sqlite';

import type { Migration } from './migrations';

function up(db: Database) {
  db.run(
    "DELETE FROM changes WHERE json_extract(what, '$.kind') = 'undo-import'"
  );
  db.run(
    `UPDATE changes SET what = json_remove(what, '$.merged', '$.lost')
     WHERE json_extract(what, '$.kind') = 'import'`
  );
  db.run(
    `UPDATE changes SET what = json_remove(what, '$.rejection')
     WHERE json_extract(what, '$.kind') = 'discard'`
  );
  db.run('DROP TABLE IF EXISTS rejections');
}

export const REIMPORT_LEFTOVERS_GO: Migration = { to: 10, up };
