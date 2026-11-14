import { signal } from '@lit-labs/signals';

import type { DatasetApi, InEntry } from '@/client/dataset-api';
import type { Box, VolumeCitation } from '@/common/types';

import { pendingEntry } from './pending-entry';
import type { EntryEdit, EntryForm, PendingCite } from './pending-entry';
import { markedIn } from './places';
import type { Readable, Selected } from './selected';
import type { ImageOpen, LinkOpen } from './source-open';

// Where a pending Box is: on an Image of a Volume.
export interface PendingAt {
  volumeId: string;
  volume: string;
  image: number;
  box: Box;
}

// A change in the Scan viewer not saved yet, of one of three kinds:
// - 'mark': the source's entry is at the Box, its Link moved there once
//   saved (a Mark);
// - 'new': a new Entry at the Box, with a Citation for each person named,
//   on the Image shown, with a source or none (ADR-0026);
// - 'edit': the source's Entry as it should be, its Box, people and words
//   changed at once (ADR-0026).
export type PendingChange =
  | (PendingAt & { kind: 'mark' })
  | (PendingAt & { kind: 'new'; cite: PendingCite })
  | (PendingAt & { kind: 'edit'; cite: PendingCite; editing: EntryEdit });

// What the pending change needs of the viewer it's in.
export interface PendingDeps {
  api: DatasetApi;
  selected: Selected;
  source: Readable<LinkOpen | null>;
  // Where a new Box goes: the Image shown of the Volume shown; null while
  // none is, or while it's read-only, on a filming Astia replaced.
  placeable: () => { volumeId: string; volume: string; image: number } | null;
  // The file id of Image `n` of the Volume shown; null until it's listed.
  fileOf: (n: number) => string | null;
  // The Volume's citations read again.
  reload: (volumeId: string) => Promise<void>;
  citations: Readable<VolumeCitation[] | null | 'failed'>;
  // Told as a Box is placed: what else was asked of the Image is dropped.
  placing: () => void;
  // The viewer to the source's Link, or onto an Image with no source.
  openLink: (open: LinkOpen) => void;
  openImage: (at: ImageOpen) => void;
}

export interface Pending {
  change: Readable<PendingChange | null>;
  // A Box for the source's entry, to move it there.
  mark: (box: Box) => void;
  // A new Entry at the Box, with the people in it so far.
  newEntry: (box: Box, people: InEntry[]) => void;
  // The source's Entry to edit, from its Box and its Citations' rows.
  editEntry: (entryId: number, box: Box, rows: VolumeCitation[]) => void;
  // The pending Box moved; the change stays of its kind.
  moveBox: (box: Box) => void;
  // Changing a new or edited Entry's people and words.
  form: EntryForm;
  // Nothing pending.
  drop: () => void;
  // Back from the change: a Mark back to the source's Link; anything
  // else stays on the Image.
  cancel: () => void;
  // Saves it, throwing ApiError if it's refused: a new Entry's Citation
  // to open, its person's if they're the Selected person, else null.
  save: () => Promise<VolumeCitation | null>;
}

// What a pending change is, wherever it is; nothing pending moves the
// source's entry.
type Kind =
  | { kind: 'mark' }
  | { kind: 'new'; cite: PendingCite }
  | { kind: 'edit'; cite: PendingCite; editing: EntryEdit };

function kindOf(change: PendingChange | null): Kind {
  if (change === null || change.kind === 'mark') return { kind: 'mark' };
  if (change.kind === 'new') return { kind: 'new', cite: change.cite };
  return { kind: 'edit', cite: change.cite, editing: change.editing };
}

export function pendingChange(deps: PendingDeps): Pending {
  const { selected, source, placeable, fileOf, reload, citations } = deps;
  const change = signal<PendingChange | null>(null);
  const entry = pendingEntry(change, {
    api: deps.api,
    selected,
    fileOf,
    reload,
    citations
  });

  function place(box: Box, kind: Kind) {
    const at = placeable();
    if (at === null) return;
    if (kind.kind === 'mark' && source.get() === null) return;
    deps.placing();
    change.set({ ...at, box, ...kind });
  }

  function moveBox(box: Box) {
    place(box, kindOf(change.get()));
  }

  function cancel() {
    const was = change.get();
    if (was === null) return;
    const shown = source.get();
    if (was.kind === 'mark' && shown !== null && shown.link !== null) {
      deps.openLink(shown);
    } else {
      change.set(null);
    }
  }

  // The Mark reloads the Volume's citations, as a confirmation does, and
  // the viewer follows the new Link. The pending Box stays until they're
  // in, or the Link's old Box shows again in between.
  async function saveMark(was: PendingChange) {
    const shown = source.get();
    if (shown === null) return;
    const { volumeId, image, box } = was;
    const resolved = await selected.mark(shown.citation.id, {
      volumeId,
      image,
      box
    });
    const link = markedIn(resolved, volumeId);
    if (source.get() !== shown) return;
    await reload(volumeId);
    if (source.get() !== shown) return;
    if (link === null) change.set(null);
    else deps.openLink({ citation: shown.citation, link });
  }

  // The source's Entry changed: the viewer stays on its Citation, at the
  // Box saved, or with the source's own person taken out, on the Image.
  async function saveEdit(was: PendingChange & { kind: 'edit' }) {
    const shown = source.get();
    const kept = await entry.saveEdit(was);
    if (shown === null || source.get() !== shown) return;
    const { link } = shown;
    const { volumeId, volume, image, box } = was;
    if (kept.includes(shown.citation.id) && link?.precision === 'entry') {
      deps.openLink({ citation: shown.citation, link: { ...link, box } });
      return;
    }
    deps.openImage({ volumeId, volume, image });
  }

  async function save() {
    const was = change.get();
    if (was === null) return null;
    switch (was.kind) {
      case 'mark':
        await saveMark(was);
        return null;
      case 'new':
        return await entry.save(was);
      case 'edit':
        await saveEdit(was);
        return null;
    }
  }

  return {
    change,
    mark(box) {
      place(box, { kind: 'mark' });
    },
    newEntry(box, people) {
      place(box, { kind: 'new', cite: { people, text: '' } });
    },
    editEntry(entryId, box, rows) {
      place(box, { kind: 'edit', ...entry.editing(entryId, box, rows) });
    },
    moveBox,
    form: entry.form,
    drop() {
      change.set(null);
    },
    cancel,
    save
  };
}
