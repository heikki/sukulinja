import { expect, test } from 'bun:test';

import type { ProposedItem } from '@/client/state';

import {
  applyWords,
  barWords,
  endNote,
  settledWords,
  spendWords,
  stateWords
} from './helpers';

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

test('says what became of an item, and what Apply applies', () => {
  expect(stateWords('open')).toBeNull();
  expect(stateWords('applied')).toBe('Applied');
  expect(stateWords({ refused: 'No.' })).toBe('Not applied: No.');
  expect(applyWords(0, false)).toBe('Apply');
  expect(applyWords(1, false)).toBe('Apply 1 change');
  expect(applyWords(3, true)).toBe('Applying…');
  expect(barWords(null, 0)).toBeNull();
  expect(barWords(null, 2)).toBe('2 changes wait');
  expect(barWords({ failed: 'No.' }, 2)).toBe('No.');
});

test('folds a settled box to what became of it', () => {
  function item(state: ProposedItem['state']): ProposedItem {
    return { id: 1, label: 'A', reason: '', exchange: 0, ticked: true, state };
  }
  expect(settledWords([item('applied'), item('applied')])).toBe(
    'Changes: 2 applied'
  );
  expect(
    settledWords([item('applied'), item({ refused: 'No.' }), item('withdrawn')])
  ).toBe('Changes: 1 applied, 1 not applied, 1 taken back');
});
