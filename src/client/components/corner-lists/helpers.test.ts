import { describe, expect, test } from 'bun:test';

import { pressed, remindersLabel } from './helpers';

describe('pressed', () => {
  test('opens the list, or another in its place', () => {
    expect(pressed(null, 'changes')).toBe('changes');
    expect(pressed('reminders', 'changes')).toBe('changes');
  });

  test('closes the list that was open', () => {
    expect(pressed('changes', 'changes')).toBeNull();
  });
});

describe('remindersLabel', () => {
  test('says how many are open', () => {
    expect(remindersLabel(1)).toBe('Reminders, 1 open');
    expect(remindersLabel(3)).toBe('Reminders, 3 open');
  });
});
