import { expect, test } from 'bun:test';

import { factsArchive } from './facts-archive';
import type { Pins } from './myheritage';
import type { FolderFacts } from './storage';

type Volume = Pins['volumes'][string];

function volume(page: number, saved?: string): Volume {
  return {
    pages: [{ image: 1, pages: [page], by: 'hand' }],
    ...(saved === undefined ? {} : { saved })
  };
}

// An offload folder of facts files alone, and a local file of Volumes.
function stores(
  archived: Record<string, Volume>,
  local: Pins['volumes'],
  about?: (id: string) => Promise<{ archive?: string; astia?: string }>
) {
  const files = new Map(
    Object.entries(archived).map(([id, v]) => [id, JSON.stringify(v)])
  );
  const folder: FolderFacts = {
    facts: async (id: string) => await Promise.resolve(files.get(id) ?? null),
    async keepFacts(id: string, text: string) {
      files.set(id, text);
      await Promise.resolve();
    },
    volumes: async () => await Promise.resolve([...files.keys()])
  };
  const kept: Pins = { volumes: { ...local }, references: {} };
  const facts = {
    volumeFacts: async () => await Promise.resolve(kept),
    async adoptVolumeFacts(volumes: Pins['volumes']) {
      Object.assign(kept.volumes, volumes);
      await Promise.resolve();
    },
    about
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
  for (const id of ['a', 'b', 'c']) {
    expect(inFolder(id)).toEqual(kept.volumes[id]);
  }
  // One never stamped is stamped as it's written.
  const { saved, ...d } = inFolder('d')!;
  expect(d).toEqual(volume(40));
  expect(saved).toBeString();
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

test('a copy says which archive holds its Volume, where it is in Astia and its Images in order, read back without them', async () => {
  const told = {
    archive: 'Hankasalmen seurakunnan arkisto',
    astia: 'https://astia.example/a',
    images: ['f1', 'f2']
  };
  async function about() {
    return await Promise.resolve(told);
  }
  const { archive, kept, inFolder } = stores(
    { a: volume(10, '2026-11-01T00:00:00.000Z') },
    { a: volume(10, '2026-11-01T00:00:00.000Z') },
    about
  );
  await archive.sync();
  const whole: Volume & typeof told = {
    ...volume(10, '2026-11-01T00:00:00.000Z'),
    ...told
  };
  expect(inFolder('a')).toEqual(whole);
  expect(kept.volumes.a).toEqual(volume(10, '2026-11-01T00:00:00.000Z'));
});
