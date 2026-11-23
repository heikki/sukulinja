import { expect, test } from 'bun:test';

import { openCacheRoom } from './cache-room';

test('is outgrown until first measured', () => {
  const room = openCacheRoom();
  expect(room.outgrown()).toBe(true);
  room.measuring()(100);
  expect(room.outgrown()).toBe(false);
});

test('is outgrown only once more is written than it had', () => {
  const room = openCacheRoom();
  room.measuring()(100);
  room.wrote(100);
  expect(room.outgrown()).toBe(false);
  room.wrote(1);
  expect(room.outgrown()).toBe(true);
});

test('counts what is written during a listing against the room found', () => {
  const room = openCacheRoom();
  const measured = room.measuring();
  room.wrote(80);
  measured(50);
  expect(room.outgrown()).toBe(true);
});

test('a listing begun before a forget does not bring the room back', () => {
  const room = openCacheRoom();
  const measured = room.measuring();
  room.forget();
  measured(100);
  expect(room.outgrown()).toBe(true);
});
