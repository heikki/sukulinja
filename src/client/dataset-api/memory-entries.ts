// Test support: the Entries of the memory Dataset API (memory.ts), as
// the server makes them (ADR-0026).

import type { Link, VolumeCitation } from '@/common/types';

import { ApiError } from './index';
import type { DatasetApi } from './index';
import type { MemoryDataset } from './memory';

type Answer = <T>(
  what: string,
  signal: AbortSignal | undefined,
  give: () => T
) => Promise<T>;

// An Image's address, as Astia's viewer gives it.
function viewerUrl(volumeId: string, fileId: string) {
  return `memory:viewer/?fileId=${fileId}&aineistoId=${volumeId}`;
}

// Entries are numbered on from 2000, their Citations by `nextId`.
export function memoryEntries(
  data: MemoryDataset,
  answer: Answer,
  nextId: () => number
): Pick<DatasetApi, 'citeEntry' | 'addToEntry' | 'transcribe' | 'deleteEntry'> {
  let entries = 2000;

  function volume(volumeId: string) {
    const shown = data.volumes?.[volumeId];
    if (shown === undefined) {
      throw new ApiError("volume not in the dataset's parishes");
    }
    return shown;
  }

  // The Volume's citations an Entry is in, and its own.
  function entryRows(entryId: number) {
    for (const shown of Object.values(data.volumes ?? {})) {
      const rows = shown.citations.filter(
        (r) => r.citation.entryId === entryId
      );
      if (rows.length > 0) return [shown, rows] as const;
    }
    return [undefined, []] as const;
  }

  return {
    citeEntry: async (at, people) =>
      await answer(
        `entry ${at.volumeId}/${at.image} ${at.fileId}: ${people
          .map((p) => `${p.personId}${p.role === null ? '' : ` as ${p.role}`}`)
          .join(', ')}${at.text === null ? '' : `: ${at.text}`}`,
        undefined,
        (): VolumeCitation[] => {
          const { volumeId, image, fileId, box } = at;
          entries += 1;
          const entryId = entries;
          const url = viewerUrl(volumeId, fileId);
          const link: Link = {
            volumeId,
            volume: volumeId,
            url,
            precision: 'entry',
            image,
            box,
            certainty: 'marked'
          };
          return people.map(({ personId, role }) => {
            const row: VolumeCitation = {
              personId,
              citation: {
                id: nextId(),
                source: volumeId,
                reference: null,
                entry: `Image\u00a0${image}`,
                page: url,
                record: null,
                text: at.text,
                churchBook: true,
                madeInApp: true,
                markKey: `entry ${entryId}`,
                citedPage: null,
                cited: null,
                supports: [],
                entryId,
                role
              },
              link
            };
            volume(volumeId).citations.push(row);
            return row;
          });
        }
      ),

    addToEntry: async (entryId, { personId, role }) =>
      await answer(
        `add to entry ${entryId}: ${personId}${role === null ? '' : ` as ${role}`}`,
        undefined,
        () => {
          const [shown, rows] = entryRows(entryId);
          const [one] = rows;
          if (shown === undefined || one === undefined) {
            throw new ApiError('No such entry.');
          }
          const row = {
            ...one,
            personId,
            citation: { ...one.citation, id: nextId(), role }
          };
          shown.citations = [...shown.citations, row];
          return row;
        }
      ),

    async transcribe(entryId, text) {
      await answer(`transcribe ${entryId}: ${text ?? ''}`, undefined, () => {
        const [shown] = entryRows(entryId);
        if (shown === undefined) return;
        shown.citations = shown.citations.map((r) =>
          r.citation.entryId === entryId
            ? { ...r, citation: { ...r.citation, text } }
            : r
        );
      });
    },

    async deleteEntry(entryId) {
      await answer(`delete entry ${entryId}`, undefined, () => {
        const [shown] = entryRows(entryId);
        if (shown === undefined) return;
        shown.citations = shown.citations.filter(
          (r) => r.citation.entryId !== entryId
        );
      });
    }
  };
}
