import { signal } from '@lit-labs/signals';

import type { DatasetApi } from '@/client/dataset-api';
import type { Box, PhotoRow } from '@/common/types';

import type { Photos } from './photos';
import type { Readable, Selected } from './selected';

// A Tag being placed: whose, and its Box as it's dragged so far. `moving`
// when it's their Box on the Photo edited, not a new Tag.
export interface PendingTag {
  personId: number;
  box: Box;
  moving: boolean;
}

// Where a Photo was opened from, and so what it steps through: the
// Selected person's Photos in the panel, or every Photo in the Photos
// view.
export type PhotosFrom = 'person' | 'all';

// What the Photo viewer shows: one of the Selected person's Photos, or
// any Photo picked in the Photos view, with no one. As the Scan viewer
// does, it belongs to the Selected person (ADR-0011): selecting someone in
// the Photo keeps it open, as it's theirs too; selecting anyone else
// closes it. People are tagged in it (ADR-0017): a Tag is placed, then
// saved or dropped, and one taken back is asked about first.
export interface PhotoViewer {
  // The Photo shown; null while it's closed.
  opened: Readable<PhotoRow | null>;
  open: (photo: PhotoRow, from?: PhotosFrom) => void;
  // The Photos it steps through, in their list's order.
  among: () => PhotoRow[];
  // To the Photo before or after; not while a Tag is pending or taken
  // back.
  step: (by: 1 | -1) => void;
  close: () => void;
  // Called by the chart once `id` is selected.
  selected: (id: number) => void;

  // The Tag pending, if any.
  pending: Readable<PendingTag | null>;
  // Whose Tag waits to be taken back, until confirmed or cancelled.
  removing: Readable<number | null>;
  // A new Tag for the person at `box`, pending.
  tagFor: (personId: number, box: Box) => void;
  // The person's Box, pending to be moved: their Tag's, or the import's,
  // which saving makes a Tag that stands in for it (ADR-0017).
  edit: (personId: number) => void;
  // The pending Tag's Box, as dragged to.
  setBox: (box: Box) => void;
  // Asks to take back the person's Tag.
  untag: (personId: number) => void;
  // Drops the pending Tag or the removal asked.
  cancel: () => void;
  // Saves the pending Tag, or takes back the one asked, throwing ApiError
  // if it's refused.
  save: () => Promise<void>;
}

export function openPhotoViewer(
  api: DatasetApi,
  selected: Selected,
  // Read again once a Tag is saved or taken back.
  photos: Photos,
  // Told once a Tag is saved or taken back, as it may change the person's
  // portrait.
  { tagged = () => undefined }: { tagged?: (personId: number) => void } = {}
): PhotoViewer {
  const opened = signal<PhotoRow | null>(null);
  const pending = signal<PendingTag | null>(null);
  const removing = signal<number | null>(null);
  const from = signal<PhotosFrom>('person');

  function among() {
    if (from.get() === 'person') return selected.details.get()?.photos ?? [];
    const all = photos.all.get();
    return Array.isArray(all) ? all : [];
  }

  function show(photo: PhotoRow | null) {
    pending.set(null);
    removing.set(null);
    opened.set(photo);
  }

  function close() {
    show(null);
  }

  function tagOf(personId: number) {
    return opened
      .get()
      ?.people.find((p) => p.personId === personId && p.tagged);
  }

  // The Photo as the save left it, if it's still the one shown; the
  // Selected person's Photos and every Photo read again.
  function saved(photo: PhotoRow, personId: number) {
    if (opened.get()?.id === photo.id) show(photo);
    tagged(personId);
    void selected.refresh();
    photos.refresh();
  }

  return {
    opened,
    open(photo, at = 'person') {
      from.set(at);
      show(photo);
    },
    among,
    step(by) {
      if (pending.get() !== null || removing.get() !== null) return;
      const shown = opened.get();
      const list = among();
      const at = list.findIndex((p) => p.id === shown?.id);
      const next = at === -1 ? undefined : list[at + by];
      if (next !== undefined) show(next);
    },
    close,
    selected(id) {
      const shown = opened.get();
      if (shown?.people.some((p) => p.personId === id) !== true) close();
    },

    pending,
    removing,
    tagFor(personId, box) {
      removing.set(null);
      pending.set({ personId, box, moving: false });
    },
    edit(personId) {
      const box = opened
        .get()
        ?.people.find((p) => p.personId === personId)?.box;
      if (box === undefined || box === null) return;
      removing.set(null);
      pending.set({ personId, box, moving: true });
    },
    setBox(box) {
      const was = pending.get();
      if (was !== null) pending.set({ ...was, box });
    },
    untag(personId) {
      if (tagOf(personId) === undefined) return;
      pending.set(null);
      removing.set(personId);
    },
    cancel() {
      pending.set(null);
      removing.set(null);
    },
    async save() {
      const photo = opened.get();
      if (photo === null) return;
      const tag = pending.get();
      const gone = removing.get();
      if (tag !== null) {
        saved(await api.tag(photo.id, tag.personId, tag.box), tag.personId);
      } else if (gone !== null) {
        saved(await api.untag(photo.id, gone), gone);
      }
    }
  };
}
