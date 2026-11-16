import { expect, test } from 'bun:test';

import type { PagesReading } from './reader';
import { MAX_SURVEY_READS, surveyVolume } from './survey';

// A reader of one Volume whose Images read as `pages` says, counting the
// questions.
function reading(pages: (image: number) => PagesReading) {
  const asked: number[] = [];
  return {
    asked,
    reader: {
      pageNumbers: async ({ image }: { image: number }) => {
        asked.push(image);
        return await Promise.resolve(pages(image));
      }
    }
  };
}

const UNREADABLE = { unreadable: true as const };

test('a Volume numbered evenly is settled by its first readings, 20 Images apart', async () => {
  // Two covers, then one number a spread.
  const { reader, asked } = reading((n) =>
    n <= 2 ? UNREADABLE : { pages: [n - 2] }
  );
  const survey = await surveyVolume(reader, { volumeId: 'v', images: 200 });
  const opening = Array.from({ length: 10 }, (_, i) => 10 + 20 * i);
  expect(survey).toEqual({
    readings: opening.map((image) => ({ image, pages: [image - 2] })),
    reads: 10,
    settled: true
  });
  expect(asked).toEqual(opening);
});

test('closes in on one leaf left out, to the Image', async () => {
  // Page 61 is missing: Image 61 holds page 62.
  const { reader } = reading((n) => ({ pages: [n <= 60 ? n : n + 1] }));
  const survey = await surveyVolume(reader, { volumeId: 'v', images: 200 });
  expect(survey.settled).toBe(true);
  expect(survey.readings).toContainEqual({ image: 60, pages: [60] });
  expect(survey.readings).toContainEqual({ image: 61, pages: [62] });
});

test('closes in on leaves inserted between two readings', async () => {
  // Four unnumbered leaves after Image 120.
  const { reader } = reading((n) =>
    n > 120 && n <= 124 ? UNREADABLE : { pages: [n <= 120 ? n : n - 4] }
  );
  const survey = await surveyVolume(reader, { volumeId: 'v', images: 200 });
  expect(survey.settled).toBe(true);
  expect(survey.reads).toBeLessThanOrEqual(16);
  const images = survey.readings.map((r) => r.image);
  expect(images).toContain(120);
  expect(images).toContain(125);
});

test('finds where the numbering starts over', async () => {
  // Parts of one book: pages 1–100 on Images 1–100, then again.
  const { reader } = reading((n) => ({ pages: [n <= 100 ? n : n - 100] }));
  const survey = await surveyVolume(reader, { volumeId: 'v', images: 200 });
  expect(survey.settled).toBe(true);
  expect(survey.readings).toContainEqual({ image: 100, pages: [100] });
  expect(survey.readings).toContainEqual({ image: 101, pages: [1] });
});

test('a page-numbered book takes two numbers an Image, once each', async () => {
  const { reader } = reading((n) => ({ pages: [2 * n, 2 * n + 1] }));
  const survey = await surveyVolume(reader, { volumeId: 'v', images: 40 });
  expect(survey).toMatchObject({ settled: true, reads: 3 });
  expect(survey.readings.map((r) => r.image)).toEqual([2, 20, 38]);
});

test('reads beside an unreadable Image, and gives up after its reads', async () => {
  const { reader } = reading(() => UNREADABLE);
  const survey = await surveyVolume(reader, { volumeId: 'v', images: 200 });
  expect(survey.readings).toEqual([]);
  expect(survey.settled).toBe(false);
  expect(survey.reads).toBe(MAX_SURVEY_READS);
  const noisy = reading((n) => ({ pages: [(n * 7919) % 500] }));
  const spent = await surveyVolume(noisy.reader, {
    volumeId: 'v',
    images: 400
  });
  expect(spent.reads).toBe(MAX_SURVEY_READS);
  expect(spent.settled).toBe(false);
});
