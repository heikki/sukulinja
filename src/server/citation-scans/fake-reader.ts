// Test support: a scripted Volume read by a fake Reader, so matcher tests
// say what each Image reads as and who is on it, without a model.

import type { Candidate } from './matcher';
import type { DatesReading, PagesReading, Reader } from './reader';

export const DAY = 24 * 60 * 60 * 1000;

export function iso(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

// A scripted Volume: what each Image's dates and Page numbers read as, and
// who is on it.
export interface Volume {
  dates?: (image: number) => DatesReading;
  pages?: (image: number) => PagesReading;
  names: Record<number, string[]>;
  // The birth year written beside a name, by Image.
  born?: Record<number, Record<string, number>>;
  // Images whose writing is too faint to find anyone on.
  faint?: Set<number>;
}

// Where the fake Reader says every entry it finds is.
export const BOX = { left: 0.1, top: 0.2, width: 0.3, height: 0.05 };

// A baptism Volume of `images` Images, each covering ten days from New
// Year 1820, so Image n holds 1820-01-01 + 10 (n - 1) days onwards.
export function baptisms(images: number, names: Record<number, string[]> = {}) {
  const start = Date.UTC(1820, 0, 1);
  return {
    images,
    volume: {
      dates: (image: number) =>
        image > images
          ? { unreadable: true as const }
          : {
              earliest: iso(start + (image - 1) * 10 * DAY),
              latest: iso(start + ((image - 1) * 10 + 9) * DAY),
              register: 'baptisms' as const
            },
      names
    } satisfies Volume
  };
}

export function fakeReader(volumes: Record<string, Volume>) {
  const asked: string[] = [];
  const reader: Reader = {
    models: { pages: 'fake', dates: 'fake', entry: 'fake' },
    pageNumbers: async ({ volumeId, image }) => {
      asked.push(`pages ${volumeId} ${image}`);
      const pages = volumes[volumeId]!.pages;
      return await Promise.resolve(
        pages === undefined ? { unreadable: true } : pages(image)
      );
    },
    dates: async ({ volumeId, image }) => {
      asked.push(`dates ${volumeId} ${image}`);
      const dates = volumes[volumeId]!.dates;
      return await Promise.resolve(
        dates === undefined ? { unreadable: true } : dates(image)
      );
    },
    findEntry: async ({ volumeId, image }, { name }) => {
      asked.push(`entry ${volumeId} ${image}`);
      const v = volumes[volumeId]!;
      if (v.faint?.has(image) === true) {
        return await Promise.resolve({ unreadable: true });
      }
      const found = (v.names[image] ?? []).includes(name);
      return await Promise.resolve({
        found,
        confidence: 0.9,
        bornYear: v.born?.[image]?.[name] ?? null,
        box: found ? BOX : null
      });
    }
  };
  return { reader, asked };
}

// A candidate Volume of `images` Images, labelled after its id.
export function candidate(volumeId: string, images: number): Candidate {
  return {
    volumeId,
    volume: `${volumeId} label`,
    images,
    years: null,
    start: null
  };
}
