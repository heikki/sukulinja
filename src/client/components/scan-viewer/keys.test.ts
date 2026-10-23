import { expect, test } from 'bun:test';

import { imageAfter } from './keys';

test('a step of one or ten goes that far', () => {
  expect(imageAfter(1, 5, 40)).toBe(6);
  expect(imageAfter(-1, 5, 40)).toBe(4);
  expect(imageAfter(10, 5, 40)).toBe(15);
  expect(imageAfter(-10, 15, 40)).toBe(5);
});

test('a step of ten stops at either end', () => {
  expect(imageAfter(-10, 4, 40)).toBe(1);
  expect(imageAfter(10, 35, 40)).toBe(40);
});

test('first and last go to the ends', () => {
  expect(imageAfter('first', 17, 40)).toBe(1);
  expect(imageAfter('last', 17, 40)).toBe(40);
});

test('a move goes nowhere at the end it goes to', () => {
  expect(imageAfter('first', 1, 40)).toBe(null);
  expect(imageAfter(-1, 1, 40)).toBe(null);
  expect(imageAfter(-10, 1, 40)).toBe(null);
  expect(imageAfter(1, 40, 40)).toBe(null);
  expect(imageAfter(10, 40, 40)).toBe(null);
  expect(imageAfter('last', 40, 40)).toBe(null);
});

test('before the count, forward steps go on and last goes nowhere', () => {
  expect(imageAfter(1, 5, null)).toBe(6);
  expect(imageAfter(10, 5, null)).toBe(15);
  expect(imageAfter('last', 5, null)).toBe(null);
  expect(imageAfter('first', 5, null)).toBe(1);
});
