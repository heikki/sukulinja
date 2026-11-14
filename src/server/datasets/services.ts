// A dataset's operations, built once for its Database: what the routes
// answer requests with, and what the assistant reads through. Every one
// that changes the dataset writes its Change into the dataset's Changes.

import type { Database } from 'bun:sqlite';

import { openChanges } from '../changes/changes';
import type { NewChange } from '../changes/changes';
import type { DatasetCitations } from '../citations';
import { createFacts } from '../facts/facts';
import { createPersonDetails } from '../person-details';
import { createDeletion } from '../persons/delete';
import { createMove } from '../persons/move';
import { createPersons } from '../persons/persons';
import { createRelatives } from '../persons/relatives';
import { createUnlink } from '../persons/unlink';
import { createPhotos, openPhotoFiles, openTags } from '../photos';
import { createReminders } from '../reminders/reminders';
import { createTree } from '../tree';

export function openServices(
  db: Database,
  scans: DatasetCitations,
  mediaDir: string
) {
  const changes = openChanges(db, scans);
  function changed(change: NewChange) {
    changes.add(change);
  }
  const photos = createPhotos(db);
  return {
    changes,
    // The dataset's Citations, and the Astia Links of its references.
    scans,
    tree: createTree(db),
    personDetails: createPersonDetails(db, scans),
    reminders: createReminders(db, scans),
    photos,
    facts: createFacts(db, changed),
    tags: openTags(db, photos, changed),
    photoFiles: openPhotoFiles(db, mediaDir, photos, changed),
    relatives: createRelatives(db, changed),
    persons: createPersons(db, changed),
    unlinking: createUnlink(db, changed),
    deletion: createDeletion(db, changed),
    moving: createMove(db, changed)
  };
}

export type DatasetServices = ReturnType<typeof openServices>;
