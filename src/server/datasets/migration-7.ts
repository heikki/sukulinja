// Schema 7 (ADR-0026): Entries of one entry are one. Schema 6 left apart
// the Citations of one entry whose words differed, as converted references
// name their person, or whose Boxes were drawn apart for each person.

import type { Database } from 'bun:sqlite';

import { mergeEntries } from '../citations';
import type { Migration } from './migrations';

function up(db: Database) {
  mergeEntries(db);
}

export const ENTRIES_OF_ONE_ENTRY_MERGE: Migration = { to: 7, up };
