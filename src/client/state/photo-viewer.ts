import { signal } from '@lit-labs/signals';

import type { PhotoRow } from '@/common/types';

import type { Readable, Selected } from './selected';

// What the Photo viewer shows: one of the Selected person's Photos. As the
// Scan viewer does, it belongs to the Selected person (ADR-0011):
// selecting someone in the Photo keeps it open, as it's theirs too;
// selecting anyone else closes it.
export interface PhotoViewer {
  // The Photo shown; null while it's closed.
  opened: Readable<PhotoRow | null>;
  open: (photo: PhotoRow) => void;
  // To the Selected person's Photo before or after, in the panel's order.
  step: (by: 1 | -1) => void;
  close: () => void;
  // Called by the chart once `id` is selected.
  selected: (id: number) => void;
}

export function openPhotoViewer(selected: Selected): PhotoViewer {
  const opened = signal<PhotoRow | null>(null);

  function close() {
    opened.set(null);
  }

  return {
    opened,
    open(photo) {
      opened.set(photo);
    },
    step(by) {
      const shown = opened.get();
      const photos = selected.details.get()?.photos ?? [];
      const at = photos.findIndex((p) => p.id === shown?.id);
      const next = at === -1 ? undefined : photos[at + by];
      if (next !== undefined) opened.set(next);
    },
    close,
    selected(id) {
      const shown = opened.get();
      if (shown?.people.some((p) => p.personId === id) !== true) close();
    }
  };
}
