import { expect, test } from 'bun:test';

import { listsLabel, tabsShown } from './helpers';

test('the lists button says how many Reminders are open', () => {
  expect(listsLabel(1)).toContain('(1 open Reminder)');
  expect(listsLabel(3)).toContain('(3 open Reminders)');
});

test('the Assistant has a tab only when it is turned on', () => {
  expect(tabsShown(false).map((t) => t.id)).not.toContain('assistant');
  expect(tabsShown(true).map((t) => t.id)).toContain('assistant');
  expect(listsLabel(0)).not.toContain('Assistant');
  expect(listsLabel(0, true)).toContain('Assistant');
});
