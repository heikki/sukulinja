import { expect, test } from 'bun:test';

import { listsLabel } from './helpers';

test('the lists button says how many Reminders are open', () => {
  expect(listsLabel(1)).toContain('(1 open Reminder)');
  expect(listsLabel(3)).toContain('(3 open Reminders)');
});
