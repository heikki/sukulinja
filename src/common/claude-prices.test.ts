import { expect, test } from 'bun:test';

import { priceWords } from './claude-prices';

test("says a model's price per million tokens", () => {
  expect(priceWords('claude-sonnet-5-5')).toBe(
    '$2 / $10 per million tokens in / out'
  );
  expect(priceWords('claude-haiku-5-5')).toBe(
    '$0.10 / $0.50 per million tokens in / out'
  );
  expect(priceWords('no-such-model')).toBeNull();
});
