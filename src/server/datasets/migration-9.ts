// Schema 9 (ADR-0025): a Change says whether it was made through the
// assistant, by a Proposal applied. Changes from before were made by hand.

import type { Database } from 'bun:sqlite';

import type { Migration } from './migrations';

function up(db: Database) {
  db.run(
    "ALTER TABLE changes ADD COLUMN via TEXT CHECK (via IN ('assistant'))"
  );
}

export const CHANGES_SAY_VIA_THE_ASSISTANT: Migration = { to: 9, up };
