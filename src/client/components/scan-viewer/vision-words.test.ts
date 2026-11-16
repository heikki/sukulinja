import { expect, test } from 'bun:test';

import type { VisionTry } from '@/common/types';

import { batchFoundWords, costWords, surveyWords } from './vision-words';

const FOUND: VisionTry = {
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
  missed: null
};
const MISSED: VisionTry = { ...FOUND, missed: 'name not found' };

test('says how many it found, and where', () => {
  expect(batchFoundWords([FOUND, MISSED], 3, 34)).toBe(
    'Found 1 of 3, their boxes on the scan.'
  );
  expect(batchFoundWords([FOUND], 2, 33)).toBe('Found 1 of 2; 1 on Image 34.');
  expect(batchFoundWords([MISSED], 1, 34)).toBe('Found none of 1.');
});

test('says what it took', () => {
  const took = {
    model: 'claude-haiku-5-5',
    readings: 14,
    cached: 3,
    dollars: 0.0042,
    seconds: 41
  };
  expect(costWords(took)).toBe(
    '14 readings, 3 of them kept from before · $0.004 · 41 s · Haiku 5.5'
  );
  expect(costWords({ ...took, readings: 1, cached: 0, dollars: 0.12 })).toBe(
    '1 reading · $0.12 · 41 s · Haiku 5.5'
  );
});

test('a page survey tells whether it read anything now', () => {
  const survey = { pinned: 9, settled: true, readBefore: false };
  expect(surveyWords(survey)).toBe(
    'Page numbers read on 9 Images, all agreeing.'
  );
  expect(surveyWords({ ...survey, readBefore: true })).toBe(
    'Page numbers already read on 9 Images, all agreeing.'
  );
});
