import { computed } from '@lit-labs/signals';

import type { DatasetApi } from '@/client/dataset-api';
import type { CitationRow, VolumeCitation } from '@/common/types';

import type { Readable, Selected } from './selected';
import type { LinkOpen } from './source-open';

// What the source's own Box is, and so what its menu offers and what
// taking it back does:
// - 'match': Vision's guess at the entry, to confirm, edit or discard;
// - 'mark': the person's Mark, to edit or discard;
// - 'citation': a Citation made in the app with no Entry, to edit or
//   delete, Box and all;
// - 'entry': an Entry made in the app (ADR-0026), edited in the card it
//   was made in; deleting it deletes everyone's Citation of it.
export type SourceBox = 'match' | 'mark' | 'citation' | 'entry';

// The source's Box, as its menu sees it.
export interface EntryBox {
  // What it is; null when the source has no Box.
  kind: Readable<SourceBox | null>;
  // Taking it back deletes the Citation: it's one made in the app.
  deletes: Readable<boolean>;
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
  const kind = computed<SourceBox | null>(() => {
    const shown = source.get();
    if (shown?.link?.precision !== 'entry') return null;
    const { citation, link } = shown;
    if (citation.madeInApp) {
      return citation.entryId === null ? 'citation' : 'entry';
    }
    return link.certainty === 'match' ? 'match' : 'mark';
  });

  const deletes = computed(() => {
    const what = kind.get();
    return what === 'citation' || what === 'entry';
  });

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

  return { kind, deletes, people, deleteMade };
}
