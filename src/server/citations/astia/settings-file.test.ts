import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openSettingsFile } from './settings-file';

let dir = '';
let path = '';

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'settings-file-'));
  path = join(dir, 'settings.local.json');
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

test('a missing or unreadable file reads as none', async () => {
  const settings = openSettingsFile(path);
  expect(await settings.read()).toEqual({});
  await Bun.write(path, 'not json');
  expect(await settings.read()).toEqual({});
  await Bun.write(path, '[1, 2]');
  expect(await settings.read()).toEqual({});
});

test('changes to different keys made at once both stay', async () => {
  const settings = openSettingsFile(path);
  await Promise.all([
    settings.update((s) => ({ ...s, a: 1 })),
    settings.update((s) => ({ ...s, b: 2 }))
  ]);
  expect(await settings.read()).toEqual({ a: 1, b: 2 });
});

test('keys written by others are kept', async () => {
  await Bun.write(path, JSON.stringify({ other: 'x' }));
  const settings = openSettingsFile(path);
  await settings.update((s) => ({ ...s, a: 1 }));
  expect(await settings.read()).toEqual({ other: 'x', a: 1 });
});

test('a change that throws leaves the next one to run', async () => {
  const settings = openSettingsFile(path);
  const failed = settings.update(() => {
    throw new Error('no');
  });
  expect(await failed.catch((err: unknown) => String(err))).toBe('Error: no');
  await settings.update((s) => ({ ...s, a: 1 }));
  expect(await settings.read()).toEqual({ a: 1 });
});
