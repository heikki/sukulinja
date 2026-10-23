import type { Viewer } from '@/client/state';

import type { MenuItem } from '../context-menu';

// What the menu offers for the current source's Link, whose person is
// `name`. On its own entry Box (`onBox`), only that Box: a Vision match's
// to confirm, edit or discard, a Mark's to edit or discard, a Citation
// made in the app's to edit or delete, and once it's pending, the change
// to discard. Elsewhere, only over the full Image (`canBox`): a pending
// Box for the person's entry, unless one is on the Image already, and
// with nothing pending, one for a new Citation of the entry for someone;
// then, with nothing pending, a Reminder, once Astia lists the Image; then
// Change Volume…, which only shows another Volume. A Box's menu offers a
// Reminder too. Opened on an Image with no source, only the Reminder.
export function linkItems(
  viewer: Viewer,
  where: { onBox: boolean; canBox: boolean; name: string | null },
  open: {
    chooseVolume: () => void;
    placeBox: () => void;
    cite: () => void;
    remind: () => void;
  }
) {
  const remind =
    viewer.pending.get() === null && viewer.fileIdHere() !== null
      ? [{ label: 'Add reminder…', run: open.remind }]
      : [];
  if (viewer.source.get() === null) return remind;
  if (where.onBox) return [...boxItems(viewer), ...remind];
  const items: MenuItem[] = [];
  if (where.canBox) {
    const label =
      where.name === null ? 'Create entry' : `Create entry for ${where.name}`;
    if (viewer.boxHere.get() === null) {
      items.push({ label, run: open.placeBox });
    }
    if (viewer.pending.get() === null) {
      items.push({ label: 'Create entry for…', run: open.cite });
    }
  }
  items.push(...remind, { label: 'Change Volume…', run: open.chooseVolume });
  return items;
}

function boxItems(viewer: Viewer): MenuItem[] {
  if (viewer.boxPending.get()) {
    return [{ label: 'Discard changes', run: viewer.cancel }];
  }
  const source = viewer.source.get();
  if (source?.citation.madeInApp === true) {
    return [
      { label: 'Edit', run: viewer.editBox },
      { label: 'Delete', run: viewer.discard }
    ];
  }
  const confirm =
    source?.link?.certainty === 'match' && !viewer.oldFilming.get()
      ? [
          {
            label: 'Confirm',
            run: () => {
              void viewer.confirmSource();
            }
          }
        ]
      : [];
  return [
    ...confirm,
    { label: 'Edit', run: viewer.editBox },
    { label: 'Discard', run: viewer.discard }
  ];
}
