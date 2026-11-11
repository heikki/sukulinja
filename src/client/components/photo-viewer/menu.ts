import type { PhotoViewer } from '@/client/state';

import type { MenuItem } from '../context-menu';

// What a right-click on the Photo offers. With a Tag pending, on its Box,
// only to discard it. Elsewhere, with nothing pending: on someone's Tag
// (`onTag`, their id), to move or remove it; anywhere else once the Photo
// is shown (`canTag`), a new Tag for someone.
export function photoItems(
  viewer: PhotoViewer,
  where: { onPending: boolean; onTag: number | null; canTag: boolean },
  open: { tag: () => void }
): MenuItem[] {
  if (viewer.pending.get() !== null) {
    return where.onPending
      ? [{ label: 'Discard changes', run: viewer.cancel }]
      : [];
  }
  const { onTag } = where;
  if (onTag !== null) {
    return [
      {
        label: 'Move tag',
        run: () => {
          viewer.move(onTag);
        }
      },
      {
        label: 'Remove tag',
        run: () => {
          viewer.untag(onTag);
        }
      }
    ];
  }
  return where.canTag ? [{ label: 'Tag someone here…', run: open.tag }] : [];
}
