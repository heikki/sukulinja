import type { Point, Viewport } from '@/client/pan-zoom';
import type { Box, PhotoPerson } from '@/common/types';

import type { StageBox } from '../box-stage/boxes';
import { newBox } from '../box-stage/geometry';

// Over the Photo: a Box around each person marked on it, by the import or
// a Tag, keyed by their id. The Selected person's is marked; the one whose
// Tag waits to be taken back is marked faint, and the one whose Tag is
// pending gives way to it.
export function photoBoxes(
  people: PhotoPerson[],
  selectedId: number | null,
  editing: { pending: number | null; removing: number | null } = {
    pending: null,
    removing: null
  }
): StageBox[] {
  return people.flatMap(({ personId, box }) => {
    if (box === null || personId === editing.pending) return [];
    const removing = personId === editing.removing;
    return [
      {
        key: String(personId),
        box,
        marked: personId === selectedId || removing,
        ...(removing ? { faint: true } : {})
      }
    ];
  });
}

// A face's size on a Photo with no other Boxes: this much of its shorter
// side, each way.
const FACE = 0.15;

// A new Tag's Box centred on `at` (in pixels of the Photo of `size`): as
// big as the others on it, or square, a face's size.
export function newTagBox(at: Point, others: Box[], size: Viewport) {
  const side = FACE * Math.min(size.width, size.height);
  return newBox(at, others, size, {
    width: side / size.width,
    height: side / size.height
  });
}

// Who has a Tag on the Photo already: it is
// edited, not made anew.
export function boxedOn(people: PhotoPerson[]) {
  return new Set(people.filter((p) => p.box !== null).map((p) => p.personId));
}
