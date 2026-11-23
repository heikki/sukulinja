import { expect, test } from 'bun:test';

import type { OffloadFolderStore } from './astia/offload-folder';
import { factsArchive } from './facts-archive';
import type { Pins } from './myheritage';

type Volume = Pins['volumes'][string];

function volume(page: number, saved?: string): Volume {
  return {
    pages: [{ image: 1, pages: [page], by: 'hand' }],
    ...(saved === undefined ? {} : { saved })
  };
}

// An offload folder of facts files alone, and a local file of Volumes.
function stores(archived: Record<string, Volume>, local: Pins['volumes']) {
  const files = new Map(
    Object.entries(archived).map(([id, v]) => [id, JSON.stringify(v)])
  );
  const folder = {
    facts: async (id: string) => await Promise.resolve(files.get(id) ?? null),
    async keepFacts(id: string, text: string) {
      files.set(id, text);
      await Promise.resolve();
    },
    volumes: async () => await Promise.resolve([...files.keys()])
  } as unknown as OffloadFolderStore;
  const kept: Pins = { volumes: { ...local }, references: {} };
  const facts = {
    volumeFacts: async () => await Promise.resolve(kept),
    async adoptVolumeFacts(volumes: Pins['volumes']) {
      Object.assign(kept.volumes, volumes);
      await Promise.resolve();
    }
  };
  function inFolder(id: string) {
    const text = files.get(id);
    return text === undefined ? undefined : (JSON.parse(text) as Volume);
  }
  return { archive: factsArchive(folder, facts), kept, inFolder };
}

test('a sync keeps each Volume whole where it was saved later, never merged', async () => {
  const { archive, kept, inFolder } = stores(
    {
      // Later in the folder: another computer's.
      a: volume(10, '2026-11-23T10:00:00.000Z'),
      // Earlier in the folder.
      b: volume(20, '2026-11-01T00:00:00.000Z'),
      // Only in the folder.
      c: volume(30, '2026-11-02T00:00:00.000Z')
    },
    {
      a: volume(11, '2026-11-20T00:00:00.000Z'),
      b: volume(21, '2026-11-22T00:00:00.000Z'),
      // Only here, never stamped.
      d: volume(40)
    }
  );
  await archive.sync();
  expect(kept.volumes.a).toEqual(volume(10, '2026-11-23T10:00:00.000Z'));
  expect(kept.volumes.b).toEqual(volume(21, '2026-11-22T00:00:00.000Z'));
  expect(kept.volumes.c).toEqual(volume(30, '2026-11-02T00:00:00.000Z'));
  for (const id of ['a', 'b', 'c', 'd']) {
    expect(inFolder(id)).toEqual(kept.volumes[id]);
  }
});

test('a save is written to the folder unless the folder has it later', async () => {
  const { archive, inFolder } = stores(
    { a: volume(10, '2026-11-23T10:00:00.000Z') },
    {}
  );
  await archive.keep({
    volumes: {
      a: volume(11, '2026-11-20T00:00:00.000Z'),
      b: volume(20, '2026-11-20T00:00:00.000Z')
    },
    references: {}
  });
  expect(inFolder('a')).toEqual(volume(10, '2026-11-23T10:00:00.000Z'));
  expect(inFolder('b')).toEqual(volume(20, '2026-11-20T00:00:00.000Z'));
});
