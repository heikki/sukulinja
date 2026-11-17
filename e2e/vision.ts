// A vision model for the e2e tests, so Vision Match runs without one: it
// reads no page numbers or dates, and finds everyone it's asked about on
// the Image `on`, at BOX.

import type { SpendingReader, VisionReaders } from '../src/server/citations';

export const BOX = { left: 0.1, top: 0.2, width: 0.4, height: 0.05 };

export function findsOn(on: number): VisionReaders {
  return async (model) => {
    const reader: SpendingReader = {
      models: { pages: model, dates: model, entry: model },
      versions: { pages: '1', dates: '1', entry: '1' },
      spend: () => ({}),
      pageNumbers: async () =>
        await Promise.resolve({ unreadable: true as const }),
      dates: async () => await Promise.resolve({ unreadable: true as const }),
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
