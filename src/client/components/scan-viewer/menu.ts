import { volumeTitle } from '@/client/link-labels';
import { imageLabel } from '@/client/on';
import type { Viewer } from '@/client/state';
import { referenceName } from '@/common/books';

import type { MenuItem } from '../context-menu';

// What the menu offers for the current source's Link. On its own entry Box (`onBox`), only that Box: a Vision match's
// to confirm, edit or discard, a Mark's to edit or discard, a Citation
// made in the app's to edit or delete, and once it's pending, the change
// to discard. Elsewhere, only over the full Image (`canBox`): a pending
// Box placing the source's Citation here, named under it as the lists name
// it, unless its Box is on the Image already, and with nothing pending,
// one for a new Citation of an entry for someone;
// then, with nothing pending, a Reminder, once Astia lists the Image; then
// Change Volume…, which only shows another Volume. A Box's menu offers a
// Reminder too. Opened on an Image with no source, only the Reminder.
export function linkItems(
  viewer: Viewer,
  where: { onBox: boolean; canBox: boolean },
  open: {
    chooseVolume: () => void;
    placeBox: () => void;
    cite: () => void;
    remind: () => void;
  }
) {
  const remind: MenuItem[] =
    viewer.pending.get() === null && viewer.fileIdHere() !== null
      ? [{ label: 'Add reminder…', run: open.remind }]
      : [];
  if (viewer.source.get() === null) return remind;
  if (where.onBox) return [...boxItems(viewer), ...remind];
  const items: MenuItem[] = [];
  if (where.canBox) {
    if (viewer.boxHere.get() === null) {
      items.push({
        label: 'Place citation here',
        detail: sourceName(viewer) ?? undefined,
        hover: viewer.setPlacing,
        run: open.placeBox
      });
    }
    if (viewer.pending.get() === null) {
      items.push({ label: 'New citation for…', run: open.cite });
    }
  }
  items.push(...remind, { label: 'Change Volume…', run: open.chooseVolume });
  return items;
}

// The source's Citation by its reference, or one made in the app by the
// Image it's on.
function sourceName(viewer: Viewer) {
  const source = viewer.source.get();
  if (source === null) return null;
  const { citation, link } = source;
  const name = referenceName(citation);
  if (name !== null || link === null) return name;
  if (link.precision === 'volume') return volumeTitle(link.volume);
  return imageLabel(link.volume, link.image);
}

function boxItems(viewer: Viewer): MenuItem[] {
  if (viewer.boxPending.get()) {
    return [{ label: 'Discard changes', run: viewer.cancel }];
  }
  const source = viewer.source.get();
  if (source?.citation.madeInApp === true) {
    // One converted from a reference can't be deleted (ADR-0016).
    const remove = source.citation.deletable
      ? [{ label: 'Delete', run: viewer.discard }]
      : [];
    return [{ label: 'Edit', run: viewer.editBox }, ...remove];
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
