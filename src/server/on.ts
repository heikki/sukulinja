// What something the app keeps beside the tree is on: a person, one of
// their Citations, or an Image of a Volume (Reminders, and the Changes).
// A table of such rows holds ON_COLUMNS; this checks a new row's target,
// fills those columns and describes them back.

import type { Database } from 'bun:sqlite';

import type { CitationRow, On, OnTarget } from '@/common/types';

// The columns that say what a row is on, in this order. A person's row
// fills person_id; a Citation's both person_id and citation_id; an
// Image's the other four, and person_id too when it's about someone.
export const ON_COLUMNS = [
  'person_id',
  'citation_id',
  'volume_id',
  'volume',
  'image',
  'file_id'
] as const;

export interface OnRow {
  person_id: number | null;
  citation_id: number | null;
  volume_id: string | null;
  volume: string | null;
  image: number | null;
  file_id: string | null;
}

export interface OnSources {
  // One of a person's Citations, with whose it is; null for none.
  citationOf: (
    id: number
  ) => { personId: number; citation: CitationRow } | null;
  // Whether a Re-scan replaced the Image's file.
  replaced: (at: {
    volumeId: string;
    image: number;
    fileId: string;
  }) => Promise<boolean>;
}

const NOTHING: OnRow = {
  person_id: null,
  citation_id: null,
  volume_id: null,
  volume: null,
  image: null,
  file_id: null
};

export function openOn(db: Database, sources: OnSources) {
  const personExists = db.prepare<{ id: number }, [number]>(
    'SELECT id FROM persons WHERE id = ?'
  );

  return {
    // The columns a new row on the target fills. Null when its person or
    // Citation isn't in the dataset; an Image's is anywhere.
    columnsOf(target: OnTarget): OnRow | null {
      if ('volumeId' in target) {
        const { volumeId, volume, image, fileId, personId } = target;
        if (personId !== undefined && personExists.get(personId) === null) {
          return null;
        }
        return {
          ...NOTHING,
          person_id: personId ?? null,
          volume_id: volumeId,
          volume,
          image,
          file_id: fileId
        };
      }
      if ('citationId' in target) {
        const cited = sources.citationOf(target.citationId);
        if (cited === null) return null;
        return {
          ...NOTHING,
          person_id: cited.personId,
          citation_id: target.citationId
        };
      }
      if (personExists.get(target.personId) === null) return null;
      return { ...NOTHING, person_id: target.personId };
    },

    // What a row is on, described; null when it's on nothing. A Citation's
    // that's gone is its person's.
    async describe(row: OnRow): Promise<On | null> {
      const { volume_id: volumeId, volume, image, file_id: fileId } = row;
      if (volumeId !== null) {
        const at = { volumeId, image: image!, fileId: fileId! };
        const stale = await sources.replaced(at);
        const personId = row.person_id;
        return { kind: 'image', volume: volume!, ...at, stale, personId };
      }
      const personId = row.person_id;
      if (personId === null) return null;
      const cited =
        row.citation_id === null ? null : sources.citationOf(row.citation_id);
      if (cited === null) return { kind: 'person', personId };
      const { citation } = cited;
      return {
        kind: 'citation',
        personId,
        citationId: citation.id,
        source: citation.source,
        reference: citation.reference ?? citation.entry
      };
    }
  };
}

export type Ons = ReturnType<typeof openOn>;
