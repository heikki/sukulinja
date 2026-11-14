// The operations on a person's Facts: the places they name, and adding,
// changing or deleting one of theirs or their marriages'.

import type { FactFields, NewFact } from '@/common/types';

import { answers, asksNothing } from './operation';
import { fieldsOf, isId, isIdOrNull, isString } from './read';

// `{ date, place, address, value, type }`, each a string, `address` empty
// when left out.
function fieldsOfFact(value: unknown): FactFields | null {
  const fields = fieldsOf(value);
  if (fields === null) return null;
  const { date, place, value: said, type, address = '' } = fields;
  if (!isString(date) || !isString(place) || !isString(address)) return null;
  if (!isString(said) || !isString(type)) return null;
  return { date, place, address, value: said, type };
}

// The fields, a `tag`, and `familyId` a number or null.
function newFactOf(value: unknown): NewFact | null {
  const read = fieldsOfFact(value);
  const fields = fieldsOf(value);
  if (read === null || fields === null) return null;
  const { tag, familyId } = fields;
  if (!isString(tag) || !isIdOrNull(familyId)) return null;
  return { ...read, tag, familyId };
}

export const FACT_OPERATIONS = {
  // The places the dataset's Facts name, the most named first.
  places: asksNothing<string[]>(),

  // Adds a Fact to the person, or to one of their families: its id.
  addFact: answers<{ personId: number; fact: NewFact }, number>(
    '{ personId, fact: { tag, familyId, date, place, address?, value, type } }',
    ({ personId, fact }) => {
      const read = newFactOf(fact);
      return isId(personId) && read !== null ? { personId, fact: read } : null;
    }
  ),

  // Changes what one of the person's Facts, or their families', says.
  editFact: answers<
    { personId: number; factId: number; fields: FactFields },
    undefined
  >(
    '{ personId, factId, fields: { date, place, address?, value, type } }',
    ({ personId, factId, fields }) => {
      const read = fieldsOfFact(fields);
      return isId(personId) && isId(factId) && read !== null
        ? { personId, factId, fields: read }
        : null;
    }
  ),

  // Deletes one, its Citations moving to its person or family.
  deleteFact: answers<{ personId: number; factId: number }, undefined>(
    '{ personId, factId }',
    ({ personId, factId }) =>
      isId(personId) && isId(factId) ? { personId, factId } : null
  )
};
