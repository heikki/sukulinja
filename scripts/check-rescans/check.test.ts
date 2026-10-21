import { expect, test } from 'bun:test';

import { fileId, memoryAstia } from '@server/citation-scans/memory-astia';

import { checkRescans, reportLines } from './check';

// Volumes v1 and v2 of ten Images; Astia re-scans v1 with eight.
function astia() {
  return memoryAstia({
    '1': {
      volumes: [
        { id: 'v1', label: 'I Ab:1', images: 10 },
        { id: 'v2', label: 'I Ab:2', images: 10 }
      ]
    }
  });
}

function on(volumeId: string, image: number) {
  return { image, fileId: fileId(volumeId, image, 'full') };
}

const SHIPPED = {
  v1: { title: 'I Ab:1', pages: [{ ...on('v1', 2), pages: [3, 4] }] },
  v2: { title: 'I Ab:2', pages: [{ ...on('v2', 5), pages: [9, 10] }] }
};

const LOCAL = {
  volumes: {
    v1: {
      pages: [],
      records: [
        { record: 7, by: 'vision' as const, ...on('v1', 6) },
        // Saved before pins kept file ids.
        { record: 8, image: 7 }
      ]
    }
  },
  references: {
    'ref-a': {
      volumeId: 'v1',
      volume: 'I Ab:1',
      by: 'hand' as const,
      ...on('v1', 4)
    },
    'ref-b': { volumeId: 'v2', volume: 'I Ab:2', ...on('v2', 1) },
    'ref-c': { volumeId: 'v1', volume: 'I Ab:1' }
  },
  rejected: { 'ref-d': [{ volumeId: 'v1', ...on('v1', 9) }] }
};

test('names the re-scanned Volume and its stale pins, and nothing else', async () => {
  const listed = astia();
  const cached = await listed.volumeImages('v1');
  listed.rescan('v1', 8);
  const result = await checkRescans(
    { shipped: SHIPPED, local: LOCAL },
    async (id) => {
      await listed.refreshImages(id);
      return await listed.volumeImages(id);
    },
    async (id) => await Promise.resolve(id === 'v1' ? cached : [])
  );
  expect(result).toEqual({
    volumes: 2,
    unchecked: 1,
    rescanned: [
      {
        volumeId: 'v1',
        title: 'I Ab:1',
        cached: 10,
        images: 8,
        stale: [
          {
            kind: 'Page pin',
            from: 'shipped',
            by: 'hand',
            image: 2,
            what: 'pages 3–4'
          },
          {
            kind: 'Record pin',
            from: 'local',
            by: 'vision',
            image: 6,
            what: 'record 7'
          },
          {
            kind: 'Reference pin',
            from: 'local',
            by: 'hand',
            image: 4,
            what: 'ref-a'
          },
          {
            kind: 'Rejection',
            from: 'local',
            by: 'hand',
            image: 9,
            what: 'ref-d'
          }
        ]
      }
    ]
  });
  expect(reportLines(result)).toEqual([
    '2 pinned Volumes checked; 1 re-scanned.',
    '1 pins on an Image have no file id to check.',
    '',
    'I Ab:1 (v1): 10 → 8 Images',
    '  shipped Page pin by hand, was Image 2: pages 3–4',
    '  local Reference pin by hand, was Image 4: ref-a',
    '  local Rejection by hand, was Image 9: ref-d',
    '  local Record pin by vision, was Image 6: record 7'
  ]);
});

test('finds nothing when no pinned Volume was re-scanned', async () => {
  const listed = astia();
  const result = await checkRescans(
    { shipped: SHIPPED },
    async (id) => await listed.volumeImages(id)
  );
  expect(result).toEqual({ volumes: 2, unchecked: 0, rescanned: [] });
});
