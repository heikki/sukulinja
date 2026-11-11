import type { PhotoViewer } from '@/client/state';

import type { MenuItem } from '../context-menu';

// What a right-click on the Photo offers. With a Tag pending, on its Box,
// only to discard it. Elsewhere, with nothing pending: on someone's Box,
// their Tag's (`onBox`, their id), to edit or delete it, as a Citation's
// Box offers, and to use it as their portrait unless it is (`portrait`).
// Anywhere else once the Photo is shown (`canTag`),
// a new Tag for someone.
export function photoItems(
  viewer: PhotoViewer,
  where: {
    onPending: boolean;
    onBox: number | null;
    portrait: boolean;
    canTag: boolean;
  },
  open: { tag: () => void }
): MenuItem[] {
  if (viewer.pending.get() !== null) {
    return where.onPending
      ? [{ label: 'Discard changes', run: viewer.cancel }]
      : [];
  }
  const { onBox } = where;
  if (onBox !== null) {
    const portrait: MenuItem[] = where.portrait
      ? []
      : [
          {
            label: 'Use as portrait',
            run: () => {
              void viewer.choosePortrait(onBox);
            }
          }
        ];
    return [
      {
        label: 'Edit',
        run: () => {
          viewer.edit(onBox);
        }
      },
      ...portrait,
      {
        label: 'Delete',
        run: () => {
          viewer.untag(onBox);
        }
      }
    ];
  }
  return where.canTag ? [{ label: 'Tag someone here…', run: open.tag }] : [];
}
