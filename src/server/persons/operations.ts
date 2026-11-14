// The operations on a dataset's tree (common/operations/tree), answered by
// its tree and the modules that change it.

import type { TREE_OPERATIONS } from '@/common/operations/tree';

import type { DatasetServices } from '../datasets/services';
import { answered } from '../operations';
import type { Handlers } from '../operations';

export function treeOperations({
  tree,
  personDetails,
  relatives,
  persons,
  unlinking,
  deletion,
  moving
}: DatasetServices): Handlers<typeof TREE_OPERATIONS> {
  return {
    persons: () => tree.persons(),
    families: () => tree.families(),
    person: ({ personId }) => answered(personDetails(personId), 'person'),
    addRelative: ({ personId, relative }) =>
      answered(relatives.add(personId, relative), 'person').id,
    editPerson({ personId, name }) {
      answered(persons.edit(personId, name), 'person');
    },
    unlink({ personId, familyId }) {
      answered(unlinking.unlink(personId, familyId), 'person');
    },
    move({ personId, from, to }) {
      answered(moving.move(personId, from, to), 'person');
    },
    deletePerson({ personId }) {
      answered(deletion.remove(personId), 'person');
    }
  };
}
