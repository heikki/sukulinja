// The operations on a dataset's tree: its people and families as the
// chart reads them, one person as the panel shows them, and adding,
// renaming, unlinking, moving and deleting people.

import type { MoveTarget } from '@/common/tree-cut';
import type {
  FamilyRow,
  NewRelative,
  PersonDetails,
  PersonName,
  PersonRow,
  Relation,
  RelativeWho,
  Sex
} from '@/common/types';

import { answers, asksNothing } from './operation';
import { fieldsOf, isId, isIdOrNull, isString } from './read';

const RELATIONS = new Set<string>([
  'father',
  'mother',
  'spouse',
  'child',
  'sibling'
]);

// `{ given, surname, sex }`, each a string. A sex GEDCOM doesn't have is
// the operation's to refuse, in words.
function nameOf(value: unknown): PersonName | null {
  const fields = fieldsOf(value);
  if (fields === null) return null;
  const { given, surname, sex } = fields;
  if (!isString(given) || !isString(surname) || !isString(sex)) return null;
  return { given, surname, sex: sex as Sex };
}

// A name, or `{ personId }` for someone in the tree.
function whoOf(value: unknown): RelativeWho | null {
  const fields = fieldsOf(value);
  if (fields === null) return null;
  return isId(fields.personId) ? { personId: fields.personId } : nameOf(value);
}

// `{ relation, who, familyId }`.
function relativeOf(value: unknown): NewRelative | null {
  const fields = fieldsOf(value);
  if (fields === null) return null;
  const { relation, familyId } = fields;
  if (!isString(relation) || !RELATIONS.has(relation)) return null;
  const who = whoOf(fields.who);
  if (who === null || !isIdOrNull(familyId)) return null;
  return { relation: relation as Relation, who, familyId };
}

// `{ familyId } | { personId }`.
function moveTargetOf(value: unknown): MoveTarget | null {
  const fields = fieldsOf(value);
  if (fields === null) return null;
  if (isId(fields.familyId)) return { familyId: fields.familyId };
  if (isId(fields.personId)) return { personId: fields.personId };
  return null;
}

export const TREE_OPERATIONS = {
  persons: asksNothing<PersonRow[]>(),

  families: asksNothing<FamilyRow[]>(),

  // A person as the panel shows them.
  person: answers<{ personId: number }, PersonDetails>(
    '{ personId }',
    ({ personId }) => (isId(personId) ? { personId } : null)
  ),

  // Adds a new person to the tree as the person's relative, or puts
  // someone in the tree in place as one: their id.
  addRelative: answers<{ personId: number; relative: NewRelative }, number>(
    '{ personId, relative: { relation, who, familyId } }',
    ({ personId, relative }) => {
      const read = relativeOf(relative);
      return isId(personId) && read !== null
        ? { personId, relative: read }
        : null;
    }
  ),

  // Changes the person's name and sex.
  editPerson: answers<{ personId: number; name: PersonName }, undefined>(
    '{ personId, name: { given, surname, sex } }',
    ({ personId, name }) => {
      const read = nameOf(name);
      return isId(personId) && read !== null ? { personId, name: read } : null;
    }
  ),

  // Takes the person out of the family, as a child or a parent.
  unlink: answers<{ personId: number; familyId: number }, undefined>(
    '{ personId, familyId }',
    ({ personId, familyId }) =>
      isId(personId) && isId(familyId) ? { personId, familyId } : null
  ),

  // Moves the person from the family to another, as a child or a parent.
  move: answers<{ personId: number; from: number; to: MoveTarget }, undefined>(
    '{ personId, from, to: { familyId } | { personId } }',
    ({ personId, from, to }) => {
      const target = moveTargetOf(to);
      return isId(personId) && isId(from) && target !== null
        ? { personId, from, to: target }
        : null;
    }
  ),

  // Deletes the person, with all they held.
  deletePerson: answers<{ personId: number }, undefined>(
    '{ personId }',
    ({ personId }) => (isId(personId) ? { personId } : null)
  )
};
