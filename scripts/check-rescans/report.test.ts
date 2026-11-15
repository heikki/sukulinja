import { expect, test } from 'bun:test';

import { reportLines } from './report';

test('lists each re-scanned Volume with its stale pins, hand ones first', () => {
  expect(
    reportLines({
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
              kind: 'record',
              by: 'vision',
              image: 6,
              record: 7
            },
            {
              kind: 'page',
              by: 'hand',
              image: 2,
              pages: [3, 4]
            },
            {
              kind: 'reference',
              by: 'hand',
              image: 4,
              url: 'ref-a'
            }
          ]
        }
      ]
    })
  ).toEqual([
    '2 pinned Volumes checked; 1 re-scanned.',
    '1 pins on an Image have no file id to check.',
    '',
    'I Ab:1 (v1): 10 → 8 Images',
    '  Page pin by hand, was Image 2: pages 3–4',
    '  Reference pin by hand, was Image 4: ref-a',
    '  Record pin by vision, was Image 6: record 7'
  ]);
});
