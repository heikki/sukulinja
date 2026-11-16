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

test('closes in first where a cited page could be, the rest after', async () => {
  // A leaf left out after Image 30 and after Image 150; page 40 is cited.
  const asked: number[] = [];
  const reader = {
    pageNumbers: async ({ image }: { image: number }) => {
      asked.push(image);
      const pages = [image + (image > 30 ? 1 : 0) + (image > 150 ? 1 : 0)];
      return await Promise.resolve({ pages });
    }
  };
  const volume = { volumeId: 'v', images: 200 };
  const survey = await surveyVolume(reader, volume, [40]);
  expect(survey.settled).toBe(true);
  const bisected = asked.slice(10);
  expect(bisected[0]).toBeLessThan(50);
  expect(bisected.some((n) => n > 150)).toBe(true);
});

test('reads four Images at a time', async () => {
  let reading = 0;
  let most = 0;
  const reader = {
    pageNumbers: async ({ image }: { image: number }) => {
      reading += 1;
      most = Math.max(most, reading);
      await Bun.sleep(1);
      reading -= 1;
      return { pages: [image] };
    }
  };
  await surveyVolume(reader, { volumeId: 'v', images: 200 });
  expect(most).toBe(4);
});

test("takes the book's numbers where an Image carries another numbering too", async () => {
  // Handwritten, one number a spread after six front leaves; printed form
  // numbers in the other corner, slower. Read both, either, or misread.
  const { reader } = reading((n) => {
    const hand = n - 6;
    const printed = Math.round(0.7 * n);
    if (n <= 6) return UNREADABLE;
    if (n % 41 === 0) return { pages: [hand + 600] };
    if (n % 7 === 2) return { pages: [printed] };
    return { pages: n % 2 === 0 ? [hand, printed] : [printed, hand] };
  });
  const survey = await surveyVolume(reader, { volumeId: 'v', images: 420 });
  expect(survey.settled).toBe(true);
  for (const { image, pages } of survey.readings) {
    expect(pages).toEqual([image - 6]);
  }
});

test("a page-numbered book read at the top left alone is told by its pace, each Image's right page following", async () => {
  const { reader } = reading((n) => ({ pages: [2 * n - 1] }));
  const survey = await surveyVolume(reader, { volumeId: 'v', images: 200 });
  expect(survey.settled).toBe(true);
  expect(survey.reads).toBe(10);
  for (const { image, pages } of survey.readings) {
    expect(pages).toEqual([2 * image - 1, 2 * image]);
  }
});

test('a digit misread where the survey ends, agreeing with no neighbour, is not pinned', async () => {
  // Image 190 reads 1153 for 1145: no Image is left to read past it.
  const { reader } = reading((n) => ({ pages: [n === 190 ? 1153 : n + 955] }));
  const survey = await surveyVolume(reader, { volumeId: 'v', images: 200 });
  expect(survey.readings.some((r) => r.image === 190)).toBe(false);
  expect(survey.readings.every((r) => r.pages[0] === r.image + 955)).toBe(true);
});

test('puts back the leading digit lost in a run of readings, not taking it for the numbering starting over', async () => {
  // 1101 to 1131 read without their 1, on Images 145 to 175.
  const { reader } = reading((n) => ({
    pages: [n >= 145 && n <= 175 ? n - 44 : n + 956]
  }));
  const survey = await surveyVolume(reader, { volumeId: 'v', images: 200 });
  expect(survey.settled).toBe(true);
  for (const { image, pages } of survey.readings) {
    expect(pages).toEqual([image + 956]);
  }
});

test('puts back a leading digit read too high in a run of readings', async () => {
  // 204 to 254 read with a 9 for their 2, on Images 190 to 240.
  const { reader } = reading((n) => ({
    pages: [n >= 190 && n <= 240 ? n + 714 : n + 14]
  }));
  const survey = await surveyVolume(reader, { volumeId: 'v', images: 300 });
  expect(survey.settled).toBe(true);
  for (const { image, pages } of survey.readings) {
    expect(pages).toEqual([image + 14]);
  }
});

test('two readings misread alike pull none of the readings around them to their line', async () => {
  // Images 60 and 118 read 4 and 42 for 54 and 112: alike, six too few.
  const { reader } = reading((n) => {
    if (n === 60) return { pages: [4] };
    if (n === 118) return { pages: [42] };
    return { pages: [n - 6] };
  });
  const survey = await surveyVolume(reader, { volumeId: 'v', images: 400 });
  for (const { image, pages } of survey.readings) {
    expect(pages).toEqual([image - 6]);
  }
});

test('puts back the leading digit two readings misread alike, among more read right', async () => {
  // Images 201 and 206 read 915 and 920 for 215 and 220.
  const { reader } = reading((n) => ({
    pages: [n === 201 || n === 206 ? n + 714 : n + 14]
  }));
  const survey = await surveyVolume(reader, { volumeId: 'v', images: 300 });
  for (const { image, pages } of survey.readings) {
    expect(pages).toEqual([image + 14]);
  }
});

test('puts back digits misread among more read right, and keeps a leaf missing', async () => {
  // Page 160 missing: Image 162 holds 161. Images 160 and 161 read with an
  // 8 for their tens' 5, Image 246 with its 4 twice.
  function truth(n: number) {
    return n < 162 ? n - 2 : n - 1;
  }
  function read(n: number) {
    if (n === 160 || n === 161) return truth(n) + 30;
    if (n === 246) return Number(String(truth(n)).replace('4', '44'));
    return truth(n);
  }
  const { reader } = reading((n) => ({ pages: [read(n)] }));
  const survey = await surveyVolume(reader, { volumeId: 'v', images: 320 });
  expect(survey.settled).toBe(true);
  for (const { image, pages } of survey.readings) {
    expect(pages).toEqual([truth(image)]);
  }
  expect(survey.readings).toContainEqual({ image: 165, pages: [164] });
  expect(survey.readings).toContainEqual({ image: 162, pages: [161] });
});
