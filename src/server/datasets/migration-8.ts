// Schema 8 (ADR-0026): a baptism Entry's people in their Roles, where
// their Citations didn't say, as the tree tells (placeEntryRoles).

import type { Database } from 'bun:sqlite';

import { placeEntryRoles } from '../citations';
import type { Migration } from './migrations';

function up(db: Database) {
  placeEntryRoles(db);
}

export const BAPTISM_ROLES_FROM_THE_TREE: Migration = { to: 8, up };
