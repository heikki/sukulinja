import { expect, test } from 'bun:test';

import type { VisionTry } from '@/common/types';

import { costWords, foundWords } from './vision-words';

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
