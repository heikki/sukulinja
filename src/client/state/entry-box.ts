import { computed } from '@lit-labs/signals';

import type { DatasetApi } from '@/client/dataset-api';
import type { CitationRow, VolumeCitation } from '@/common/types';

import type { Readable, Selected } from './selected';
import type { LinkOpen } from './source-open';

// The source's Entry (ADR-0026), as its Box's menu sees it.
export interface EntryBox {
  // Everyone citing the source's Entry, the source too; none when it
  // cites none.
  people: Readable<VolumeCitation[]>;
  // Deletes the Citation made in the app, with everyone's in its Entry,
  // throwing ApiError if it's refused.
  deleteMade: (citation: CitationRow) => Promise<void>;
}

export function entryBox(
  api: DatasetApi,
  selected: Selected,
  source: Readable<LinkOpen | null>,
  citations: Readable<VolumeCitation[] | null | 'failed'>
): EntryBox {
  const people = computed(() => {
    const id = source.get()?.citation.entryId ?? null;
    const rows = citations.get();
    if (id === null || !Array.isArray(rows)) return [];
    return rows.filter((r) => r.citation.entryId === id);
  });

  async function deleteMade({ id, entryId }: CitationRow) {
    if (entryId === null) await selected.uncite(id);
    else {
      await api.deleteEntry(entryId);
      void selected.refresh();
    }
  }

  return { people, deleteMade };
}
