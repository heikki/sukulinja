import type { Viewer } from '@client/state';

import type { MenuItem } from '../context-menu';

// What the menu offers for the current source's Link; the menu is titled
// with its person. On its own entry Box (`onBox`), only that Box: a Vision
// match's or a Mark's to edit or discard, a Citation made in the app's to
// edit or delete, and once it's pending, the change to discard. Confirming
// a Vision match is beside the scan. Elsewhere, only over the full Image
// (`canBox`) and with nothing pending: a pending Box for the person's
// entry, and one for a new Citation of the entry for someone; then Change
// Volume…, which only shows another Volume.
export function linkItems(
  viewer: Viewer,
  where: { onBox: boolean; canBox: boolean },
  open: { chooseVolume: () => void; placeBox: () => void; cite: () => void }
) {
  if (where.onBox) return boxItems(viewer);
  const items: MenuItem[] = [];
  if (where.canBox) {
    items.push({ label: 'Mark entry', run: open.placeBox });
    if (viewer.pending.get() === null) {
      items.push({ label: 'Cite this entry for…', run: open.cite });
    }
  }
  items.push({ label: 'Change Volume…', run: open.chooseVolume });
  return items;
}

function boxItems(viewer: Viewer): MenuItem[] {
  if (viewer.boxPending.get()) {
    return [{ label: 'Discard changes', run: viewer.cancel }];
  }
  const source = viewer.source.get();
  if (source?.citation.madeInApp === true) {
    return [
      { label: 'Edit mark', run: viewer.editBox },
      { label: 'Delete citation', run: viewer.discard }
    ];
  }
  if (source?.link?.certainty === 'vision') {
    return [
      { label: 'Edit match', run: viewer.editBox },
      { label: 'Discard match', run: viewer.discard }
    ];
  }
  return [
    { label: 'Edit mark', run: viewer.editBox },
    { label: 'Discard mark', run: viewer.discard }
  ];
}
