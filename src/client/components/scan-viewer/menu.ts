import type { Viewer } from '@client/state';

import type { MenuItem } from '../context-menu';

// What the menu offers for the current source's Link; the menu is titled
// with its person. On its own entry Box (`onBox`), only that Box: a Vision
// match's or a Mark's to edit or discard, and once it's pending, the change
// to discard. Confirming a Vision match is beside the scan. Elsewhere: a
// pending Box for the person's entry (only over the full Image, `canBox`),
// and Change Volume…, which only shows another Volume.
export function linkItems(
  viewer: Viewer,
  where: { onBox: boolean; canBox: boolean },
  open: { chooseVolume: () => void; placeBox: () => void }
) {
  const items: MenuItem[] = [];
  if (where.onBox) {
    if (viewer.boxPending.get()) {
      items.push({ label: 'Discard changes', run: viewer.cancel });
      return items;
    }
    if (viewer.source.get()?.link?.certainty === 'vision') {
      items.push(
        { label: 'Edit match', run: viewer.editBox },
        { label: 'Discard match', run: viewer.discard }
      );
    } else {
      items.push(
        { label: 'Edit mark', run: viewer.editBox },
        { label: 'Discard mark', run: viewer.discard }
      );
    }
    return items;
  }
  if (where.canBox) {
    items.push({ label: 'Mark entry', run: open.placeBox });
  }
  items.push({ label: 'Change Volume…', run: open.chooseVolume });
  return items;
}
