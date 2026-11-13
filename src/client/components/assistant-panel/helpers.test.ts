import { expect, test } from 'bun:test';

import { endNote, spendWords } from './helpers';

function spend(dollars: number | null) {
  return { calls: 3, inputTokens: 1, outputTokens: 1, dollars };
}

test('says what a conversation has cost', () => {
  expect(spendWords(null)).toBeNull();
  expect(spendWords(spend(0.004))).toBe('Under 1 ¢ so far');
  expect(spendWords(spend(0.126))).toBe('13 ¢ so far');
  expect(spendWords(spend(2.5))).toBe('$2.50 so far');
  expect(spendWords(spend(null))).toBe('3 requests');
});

test('notes an answer that was not given in full', () => {
  expect(endNote('answered')).toBeNull();
  expect(endNote(null)).toBeNull();
  expect(endNote('declined')).toBe('Claude declined to answer this.');
});
