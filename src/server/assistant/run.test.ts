import { expect, test } from 'bun:test';

import { systemFor } from './run';

test('tells Claude the living are left out, unless they are included', () => {
  expect(systemFor('terse')).toContain('may be living are left out');
  expect(systemFor('terse', true)).not.toContain('may be living');
  expect(systemFor('thorough', true)).toContain('Answer thoroughly');
});
