// A vision model for the e2e tests, so Vision Match runs without one: it
// reads the page numbers `pagesOf` gives an Image if any, and
// finds everyone it's asked about on the Image `on`, at BOX.

import type { SpendingReader, VisionReaders } from '@/server/citations';

export const BOX = { left: 0.1, top: 0.2, width: 0.4, height: 0.05 };

export function findsOn(
  on: number,
  pagesOf?: (image: number) => number[]
): VisionReaders {
  return async (model) => {
    const reader: SpendingReader = {
      models: { pages: model, entry: model },
      versions: { pages: '1', entry: '1' },
      spend: () => ({}),
      pageNumbers: async ({ image }) =>
        await Promise.resolve(
          pagesOf === undefined
            ? { unreadable: true as const }
            : { pages: pagesOf(image) }
        ),
      findEntry: async ({ image }) =>
        await Promise.resolve(foundIf(image === on)),
      findEntries: async ({ image }, people) =>
        await Promise.resolve(people.map(() => foundIf(image === on)))
    };
    return await Promise.resolve(reader);
  };
}

function foundIf(found: boolean) {
  return { found, confidence: 0.9, box: found ? BOX : null };
}
