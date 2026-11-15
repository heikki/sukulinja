import { expect, test } from 'bun:test';

import { batchTook } from '@/client/state/vision-batch';
import type { VisionTry } from '@/common/types';

import { batchFoundWords, costWords, foundWords } from './vision-words';

const TRIED: VisionTry = {
  links: {
    citationId: 1,
    links: [
      {
        volumeId: '201',
        volume: 'I Aa:201',
        url: '',
        precision: 'entry',
        image: 34,
        box: { left: 1, top: 2, width: 3, height: 4 },
        certainty: 'match'
      }
    ]
  },
  missed: null,
  model: 'claude-haiku-5-5',
  readings: 14,
  cached: 3,
  dollars: 0.0042,
  seconds: 41
};

test('says where it found the entry, and what that took', () => {
  expect(foundWords(TRIED)).toBe(
    'Found on I Aa:201, Image 34. Right-click its box to confirm or discard it.'
  );
  expect(costWords(TRIED)).toBe(
    '14 readings, 3 of them kept from before · $0.004 · 41 s · Haiku 5.5'
  );
});

test('says why it found none', () => {
  const missed = {
    ...TRIED,
    missed: 'name not found',
    cached: 0,
    dollars: 0.12
  };
  expect(foundWords(missed)).toBe(
    "The name wasn't found on the Images searched."
  );
  expect(costWords(missed)).toBe('14 readings · $0.12 · 41 s · Haiku 5.5');
});

test('sums a batch, and says where its Matches are', () => {
  const missed = { ...TRIED, missed: 'name not found', cached: 0 };
  expect(batchFoundWords([TRIED, missed], 3, 34)).toBe(
    'Found 1 of 3, their boxes on the scan.'
  );
  expect(batchFoundWords([TRIED], 2, 33)).toBe('Found 1 of 2; 1 on Image 34.');
  expect(batchFoundWords([missed], 1, 34)).toBe('Found none of 1.');
  expect(costWords(batchTook([TRIED, missed], 'claude-haiku-5-5', 80))).toBe(
    '28 readings, 3 of them kept from before · $0.008 · 80 s · Haiku 5.5'
  );
});
