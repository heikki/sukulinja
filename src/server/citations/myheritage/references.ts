// MyHeritage's Church-book references as the References port gives them
// to the rest of the Citations (../references.ts): read from a citation's
// page and text, resolved and saved through the dataset's Scans. A
// Citation made in the app is never one, whatever its pages (ADR-0016).

import type { Database } from 'bun:sqlite';

import type { RecordView } from '@/common/types';

import { annotated, annotationColumnsSql } from '../annotations';
import type { References } from '../references';
import { openMarks } from './pins/marks';
import type { Marks } from './pins/marks';
import { churchBookRefOf, markKey, readRecord } from './record';
import type { ChurchBookRef } from './record';
import type { Scans } from './scans';

// A MyHeritage record's page: its text is the record's transcription.
function isRecordPage(page: string | null) {
  return page !== null && /^https?:/.test(page) && page.includes('myheritage.');
}

// A record's transcription as plain lines: whom it's about, its fields,
// then its household's rows.
export function plainRecord({ name, fields, household }: RecordView) {
  const rows = household.map((m) =>
    [m.relation, m.name, m.born].filter((x) => x !== null).join('; ')
  );
  const lines = [name, ...fields.map((f) => `${f.label}: ${f.value}`), ...rows];
  const text = lines.filter((l) => l !== '').join('\n');
  return text === '' ? null : text;
}

interface TextRow {
  id: number;
  text: string | null;
}

export function referencesOf(
  scans: Scans,
  { db, marks }: { db: Database; marks: Marks }
): References<ChurchBookRef> {
  const rowOf = db.prepare<TextRow, [number]>(
    `SELECT id, text, ${annotationColumnsSql()} FROM citations WHERE id = ?`
  );

  return {
    refOf: ({ page, text, annotation }) =>
      annotation.madeInApp ? null : churchBookRefOf(page, text),
    markKey,
    recordOf: ({ page, text, annotation }) =>
      !annotation.madeInApp && isRecordPage(page)
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
        return [{ id, text: plainRecord(readRecord(text ?? '')) }];
      });
    }
  };
}

// The dataset's references of a record or URL a converted Citation cites:
// each group with the Link to give them, and their texts as plain lines,
// for a Conversion of their own.
export function kinOfConverted(db: Database) {
  const textOf = db.prepare<{ text: string | null }, [number]>(
    'SELECT text FROM citations WHERE id = ?'
  );
  return openMarks(db)
    .kinOfConverted()
    .map(({ link, ids }) => ({
      link,
      rows: ids.map((id) => ({
        id,
        text: plainRecord(readRecord(textOf.get(id)?.text ?? ''))
      }))
    }));
}
