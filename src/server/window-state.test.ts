import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test } from 'bun:test';

import { loadWindowFrame, saveWindowFrame } from './window-state';

let root = '';

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'window-state-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

test('a saved frame loads back', () => {
  const frame = { x: 40, y: 60, width: 900, height: 700 };
  saveWindowFrame(root, frame);
  expect(loadWindowFrame(root)).toEqual(frame);
});

test('saving creates a missing directory', () => {
  const dir = join(root, 'not', 'yet');
  saveWindowFrame(dir, { x: 0, y: 0, width: 1, height: 1 });
  expect(loadWindowFrame(dir)).not.toBeNull();
});

test('no state file loads as null', () => {
  expect(loadWindowFrame(root)).toBeNull();
});

test('an unreadable or incomplete state file loads as null', async () => {
  await writeFile(join(root, 'state.json'), '{not json');
  expect(loadWindowFrame(root)).toBeNull();
  await writeFile(
    join(root, 'state.json'),
    JSON.stringify({ window: { x: 1, y: 2, width: 3 } })
  );
  expect(loadWindowFrame(root)).toBeNull();
});
