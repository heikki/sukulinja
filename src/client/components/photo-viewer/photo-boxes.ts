import type { PhotoPerson } from '@/common/types';

import type { StageBox } from '../box-stage/boxes';

// Over the Photo: a Box around each person the import marked on it, keyed
// by their id. The Selected person's is marked.
export function photoBoxes(
  people: PhotoPerson[],
  selectedId: number | null
): StageBox[] {
  return people.flatMap(({ personId, box }) =>
    box === null
      ? []
      : [{ key: String(personId), box, marked: personId === selectedId }]
  );
}
