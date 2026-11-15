import { expect, test } from 'bun:test';

import { misfit } from './fits';

const SCHEMA = {
  type: 'object',
  properties: {
    changes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          personId: { type: 'integer' },
          tag: { type: 'string', enum: ['BIRT', 'DEAT'] },
          place: { type: ['string', 'null'] }
        },
        required: ['personId', 'tag', 'place'],
        additionalProperties: false
      }
    },
    reason: { type: 'string' }
  },
  required: ['changes', 'reason'],
  additionalProperties: false
};

const CHANGE = { personId: 1, tag: 'BIRT', place: null };

test('an input that fits has nothing wrong', () => {
  expect(misfit(SCHEMA, { changes: [CHANGE], reason: 'Kastekirja.' })).toBe(
    null
  );
});

test('says what in an input does not fit', () => {
  expect(misfit(SCHEMA, { changes: [CHANGE] })).toBe('input.reason is missing');
  expect(
    misfit(SCHEMA, { changes: [{ ...CHANGE, personId: 1.5 }], reason: '' })
  ).toBe('input.changes[0].personId should be "integer"');
  expect(
    misfit(SCHEMA, { changes: [{ ...CHANGE, tag: 'MARR' }], reason: '' })
  ).toBe('input.changes[0].tag should be one of BIRT, DEAT');
  expect(
    misfit(SCHEMA, { changes: [{ ...CHANGE, extra: 1 }], reason: '' })
  ).toBe("input.changes[0].extra isn't asked for");
  expect(misfit(SCHEMA, { changes: 'all', reason: '' })).toBe(
    'input.changes should be "array"'
  );
});
