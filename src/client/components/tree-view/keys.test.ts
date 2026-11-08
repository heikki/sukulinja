import { expect, test } from 'bun:test';

import { chartKeyOf } from './keys';

function press(
  key: string,
  mods: { repeat?: boolean; meta?: boolean; shift?: boolean } = {}
) {
  return {
    key,
    repeat: mods.repeat ?? false,
    metaKey: mods.meta ?? false,
    ctrlKey: false,
    altKey: false,
    shiftKey: mods.shift ?? false
  };
}

test('the arrows step, Enter makes Root, Space shows or hides the dock', () => {
  expect(chartKeyOf(press('ArrowUp'), 'other')).toBe('up');
  expect(chartKeyOf(press('ArrowLeft'), 'other')).toBe('left');
  expect(chartKeyOf(press('Enter'), 'other')).toBe('root');
  expect(chartKeyOf(press(' '), 'other')).toBe('dock');
  expect(chartKeyOf(press('a'), 'other')).toBeNull();
});

test('a field keeps every key', () => {
  expect(chartKeyOf(press('ArrowDown'), 'field')).toBeNull();
  expect(chartKeyOf(press(' '), 'field')).toBeNull();
});

test('a button or link keeps Space and Enter, not the arrows', () => {
  expect(chartKeyOf(press(' '), 'control')).toBeNull();
  expect(chartKeyOf(press('Enter'), 'control')).toBeNull();
  expect(chartKeyOf(press('ArrowRight'), 'control')).toBe('right');
});

test('shortcuts and modified keys are left alone', () => {
  expect(chartKeyOf(press('ArrowUp', { meta: true }), 'other')).toBeNull();
  expect(chartKeyOf(press('ArrowUp', { shift: true }), 'other')).toBeNull();
});

test('only an arrow repeats while held', () => {
  expect(chartKeyOf(press('ArrowDown', { repeat: true }), 'other')).toBe(
    'down'
  );
  expect(chartKeyOf(press('Enter', { repeat: true }), 'other')).toBeNull();
  expect(chartKeyOf(press(' ', { repeat: true }), 'other')).toBeNull();
});
