// Schema 11 (ADR-0022): `citations` no longer takes scope_type 'fact'.
// Schema 5 moved every Citation on a Fact to the Fact's owner; one whose
// Fact was gone was left, shown and exported nowhere, and goes now with
// its notes and media links, as the app deletes a Citation. The table is
// rebuilt without 'fact' in its CHECK.

import type { Database } from 'bun:sqlite';

import type { Migration } from './migrations';

function up(db: Database) {
  const left = "SELECT id FROM citations WHERE scope_type = 'fact'";
  db.run(
    `DELETE FROM notes WHERE owner_type = 'citation' AND owner_id IN (${left})`
  );
  db.run(
    `DELETE FROM media_links WHERE scope_type = 'citation' AND scope_id IN (${left})`
  );
  db.run(`DELETE FROM fact_citations WHERE citation_id IN (${left})`);
  db.run(
    `UPDATE changes SET citation_id = NULL WHERE citation_id IN (${left})`
  );
  db.run("DELETE FROM citations WHERE scope_type = 'fact'");
  db.run(
    `CREATE TABLE new_citations (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       scope_type TEXT NOT NULL CHECK (
         scope_type IN ('person','family','name','note','shared_note')
       ),
       scope_id INTEGER NOT NULL,
       source_id INTEGER REFERENCES sources(id) ON DELETE SET NULL,
       page TEXT,
       event TEXT,
       role TEXT,
       quality INTEGER,
       data_date TEXT,
       text TEXT,
       original_page TEXT,
       link_volume_id TEXT,
       link_volume TEXT,
       link_image INTEGER,
       link_file_id TEXT,
       link_box_left INTEGER,
       link_box_top INTEGER,
       link_box_width INTEGER,
       link_box_height INTEGER,
       link_by TEXT CHECK (link_by IN ('hand','vision')),
       added_in_app INTEGER NOT NULL DEFAULT 0,
       sort_order INTEGER NOT NULL DEFAULT 0,
       entry_id INTEGER REFERENCES entries(id),
       CHECK ((link_volume_id IS NULL) = (link_by IS NULL))
     )`
  );
  db.run('INSERT INTO new_citations SELECT * FROM citations');
  db.run('DROP TABLE citations');
  db.run('ALTER TABLE new_citations RENAME TO citations');
  db.run('CREATE INDEX citations_scope_idx ON citations(scope_type, scope_id)');
  db.run('CREATE INDEX citations_entry_idx ON citations(entry_id)');
}

export const FACT_CITATIONS_GO: Migration = { to: 11, up };
