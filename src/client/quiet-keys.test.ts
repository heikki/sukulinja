import { expect, test } from 'bun:test';

import { quiets } from './quiet-keys';

function press(key: string, mods: { meta?: boolean; ctrl?: boolean } = {}) {
  return { key, metaKey: mods.meta ?? false, ctrlKey: mods.ctrl ?? false };
}

function nothingScrolls() {
  return false;
}

function scrollsDown(axis: 'x' | 'y') {
  return axis === 'y';
}

test('a letter typed with no field focused is quieted', () => {
  expect(quiets(press('a'), 'other', nothingScrolls)).toBe(true);
  expect(quiets(press('Escape'), 'other', nothingScrolls)).toBe(true);
});

test('typing in a field is left to the field', () => {
  expect(quiets(press('a'), 'field', nothingScrolls)).toBe(false);
  expect(quiets(press('ArrowLeft'), 'field', nothingScrolls)).toBe(false);
});

test('shortcuts go on to the app menu, and Tab moves focus', () => {
  expect(quiets(press('c', { meta: true }), 'other', nothingScrolls)).toBe(
    false
  );
  expect(quiets(press('q', { ctrl: true }), 'other', nothingScrolls)).toBe(
    false
  );
  expect(quiets(press('Tab'), 'other', nothingScrolls)).toBe(false);
});

test('a scrolling key scrolls where there is room that way, else is quieted', () => {
  expect(quiets(press('ArrowDown'), 'other', scrollsDown)).toBe(false);
  expect(quiets(press(' '), 'other', scrollsDown)).toBe(false);
  expect(quiets(press('ArrowRight'), 'other', scrollsDown)).toBe(true);
  expect(quiets(press('ArrowDown'), 'other', nothingScrolls)).toBe(true);
});

test('Space and Enter press a button, other keys on it are quieted', () => {
  expect(quiets(press(' '), 'control', nothingScrolls)).toBe(false);
  expect(quiets(press('Enter'), 'control', nothingScrolls)).toBe(false);
  expect(quiets(press('x'), 'control', nothingScrolls)).toBe(true);
});
