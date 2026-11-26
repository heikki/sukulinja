// MyHeritage's Church-book references as the References port gives them
// to the rest of the Citations (../references.ts): read from a citation's
// page and text, resolved and saved through the dataset's Scans. A
// Citation made in the app is never one, whatever its pages (ADR-0016).

import type { Database } from 'bun:sqlite';

import { isoDate, typedDate } from '@/common/dates';
import { plainRecord } from '@/common/record-text';

import { annotated, annotationColumnsSql } from '../annotations';
import { CITATIONS_READ } from '../entries';
import type { References } from '../references';
import type { Marks } from './pins/marks';
import {
  churchBookRefOf,
  indexEventDateOf,
  indexRoleOf,
  markKey,
  readRecord,
  referencePageOf
} from './record';
import type { ChurchBookRef } from './record';
import type { Scans } from './scans';
import { findAllOnImage } from './vision/find';

// A MyHeritage record's page: its text is the record's transcription.
function isRecordPage(page: string | null) {
  return page !== null && /^https?:/.test(page) && page.includes('myheritage.');
}

interface TextRow {
  id: number;
  text: string | null;
  role: string | null;
}

// The date of its Event an index reference gives, as a GEDCOM date: its
// baptism's or marriage's, not a birth's (ADR-0039). Null for a rippikirja's.
function entryDateOf(ref: ChurchBookRef, plain: string) {
  if (ref.date === null) return null;
  const date = indexEventDateOf(plain);
  return date === null ? null : typedDate(isoDate(date));
}

export function referencesOf(
  scans: Scans,
  { db, marks }: { db: Database; marks: Marks }
): References<ChurchBookRef> {
  const rowOf = db.prepare<TextRow, [number]>(
    `SELECT id, text, role, ${annotationColumnsSql()} FROM ${CITATIONS_READ} WHERE id = ?`
  );

  return {
    refOf: ({ page, text, role, entryId }) =>
      entryId === null ? churchBookRefOf(page, text, role) : null,
    markKey,
    recordOf: ({ page, text, role, entryId }) =>
      entryId === null && isRecordPage(referencePageOf(page, role))
        ? readRecord(text ?? '')
        : null,
    resolve: scans.resolveRef,
    stamp: scans.stamp,
    volumeLinks: async (volumeId, refs) =>
      await scans.volumeLinks(volumeId, refs),
    archiveLinks: async (archiveId, refs) =>
      await scans.archiveLinks(archiveId, refs),
    mark: async (ref, target) => await scans.markRef(ref, target),
    discard: async (ref, at) => await scans.discardRef(ref, at),
    volumeChoices: async (ref) => await scans.volumeChoices(ref),
    findAllOnImage: async (refs, at, reader) =>
      await findAllOnImage(scans, at, refs, reader),

    converts(ref) {
      return marks.idsOf(markKey(ref)).flatMap((id) => {
        const row = rowOf.get(id);
        if (row === null) return [];
        const { text, annotation } = annotated(row);
        const { link } = annotation;
        const atEntry =
          link?.by === 'hand' &&
          link.fileId !== undefined &&
          link.box !== undefined;
        if (!atEntry) return [];
        const role = indexRoleOf(row.role);
        const plain = plainRecord(readRecord(text ?? ''));
        return [
          {
            id,
            text: plain,
            role,
            bookPage: ref.page,
            date: entryDateOf(ref, plain ?? '')
          }
        ];
      });
    }
  };
}
