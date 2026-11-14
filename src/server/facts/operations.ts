// The operations on a person's Facts (common/operations/facts), answered
// by the dataset's Facts.

import type { FACT_OPERATIONS } from '@/common/operations/facts';

import { answered, notFound } from '../operations';
import type { Handlers } from '../operations';
import type { Facts } from './facts';

export function factOperations(facts: Facts): Handlers<typeof FACT_OPERATIONS> {
  return {
    places: () => facts.places(),
    addFact: ({ personId, fact }) =>
      answered(facts.add(personId, fact), 'person').id,
    editFact({ personId, factId, fields }) {
      answered(facts.edit(personId, factId, fields), 'fact');
    },
    deleteFact({ personId, factId }) {
      if (!facts.remove(personId, factId)) throw notFound('fact');
    }
  };
}
