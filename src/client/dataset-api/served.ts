// Test support: the Dataset API over the app's own server, in-process, so
// the routes and answers the client expects, and the app state that
// writes the dataset, run on the server's own rules rather than a copy of
// them. One dataset, "juva", of the GEDCOM given, in a folder of its own;
// Astia answers from memory.

import type { Database } from 'bun:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Model } from '@/server/assistant/model';
import type { MemoryAstia } from '@/server/citations/testing';
import { memoryKeyStore } from '@/server/claude/key';
import { DatasetRegistry } from '@/server/datasets/registry';
import { parseGedcom } from '@/server/gedcom/parser';
import { importGedcom } from '@/server/import/gedcom';
import { createApi, createStaticFetch } from '@/server/server';

import { openDatasetApi } from './';

export const ORIGIN = 'http://localhost';

interface ServedOptions {
  // Writes into the dataset, and its media folder, before it's served.
  seed?: (staging: { db: Database; mediaDir: string }) => Promise<void> | void;
  // Answers the assistant's turns.
  assistant?: Model;
}

export async function servedDataset(
  gedcom: string,
  astia: MemoryAstia,
  { seed, assistant }: ServedOptions = {}
) {
  const root = await mkdtemp(join(tmpdir(), 'served-'));
  const registry = new DatasetRegistry(join(root, 'data'));
  const staging = await registry.createStaging('juva');
  importGedcom(staging.db, parseGedcom(gedcom), () => null);
  await seed?.(staging);
  await staging.commit();

  // The server over `over`, and the client asking it.
  function servedOver(over: MemoryAstia) {
    const serve = createStaticFetch({
      api: createApi(registry, {
        astia: over,
        keyStore: memoryKeyStore('sk-test'),
        ...(assistant === undefined ? {} : { assistantModel: () => assistant })
      }),
      staticRoots: []
    });
    const api = openDatasetApi('juva', { fetch: serve, origin: ORIGIN });
    return { api, serve };
  }

  return {
    ...servedOver(astia),
    servedOver,
    // The dataset as stored.
    db: () => registry.open('juva'),
    async close() {
      await rm(root, { recursive: true, force: true });
    }
  };
}
