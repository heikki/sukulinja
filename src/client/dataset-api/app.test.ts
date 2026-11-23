// The app-wide adapter against the app's own server, in-process: what
// it's asked is answered, and what's refused reaches the page as the
// server's own words.

import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { JUVA, juvaAstia } from '@/server/citations/testing';
import { memoryKeyStore } from '@/server/claude/key';
import { withoutEnvironmentKeys } from '@/server/claude/testing';
import { DatasetRegistry } from '@/server/datasets/registry';
import { createApi, createStaticFetch } from '@/server/server';

import { ApiError } from './';
import { openAppApi } from './app';
import type { AppApi } from './app';

let root = '';
let api: AppApi = openAppApi();

withoutEnvironmentKeys();

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'app-api-'));
  const serve = createStaticFetch({
    api: createApi(new DatasetRegistry(join(root, 'data')), {
      astia: juvaAstia(),
      keyStore: memoryKeyStore()
    }),
    staticRoots: []
  });
  api = openAppApi({ fetch: serve, origin: 'http://localhost' });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

test("a parish's church books are listed", async () => {
  const books = await api.churchBooks(JUVA);
  expect(books.map((b) => b.id)).toEqual(['juva-1', 'juva-2', 'juva-3']);
});

test('a Volume is taken off the disk', async () => {
  await api.removeFromDisk('1');
});

test("a refusal is the server's words", async () => {
  const refused = await api
    .setStorageCap(3)
    .catch((err: unknown) => (err instanceof ApiError ? err.message : err));
  expect(refused).toMatch(/^expected \{ cap \} of /u);
});

test('the key is kept and removed, never sent back', async () => {
  expect(await api.assistantKey()).toEqual({ source: null });
  expect(await api.setAssistantKey('sk-test')).toEqual({ source: 'saved' });
  expect(await api.removeAssistantKey()).toEqual({ source: null });
});
