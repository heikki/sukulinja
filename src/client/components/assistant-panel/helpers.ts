import type { ProposedItem } from '@/client/state';
import type { AssistantTurnEnd, Spend } from '@/common/types';

// What's said under an answer that didn't end as answered.
export function endNote(ended: AssistantTurnEnd | null) {
  switch (ended) {
    case 'declined':
      return 'Claude declined to answer this.';
    case 'too-long':
      return 'The answer was cut short.';
    case 'too-many-steps':
      return 'Stopped: it took too many steps.';
    default:
      return null;
  }
}

// What the conversation has cost so far, in cents under a dollar.
export function spendWords(spend: Spend | null) {
  if (spend === null) return null;
  if (spend.dollars === null) return `${spend.calls} requests`;
  const dollars = spend.dollars;
  return dollars < 0.01
    ? 'Under 1 ¢ so far'
    : dollars < 1
      ? `${Math.round(dollars * 100)} ¢ so far`
      : `$${dollars.toFixed(2)} so far`;
}

// What became of an item of the Proposal, said under it; null while it
// waits.
export function stateWords(state: ProposedItem['state']) {
  if (state === 'open') return null;
  if (state === 'applied') return 'Applied';
  if (state === 'withdrawn') return 'Taken back';
  return `Not applied: ${state.refused}`;
}

// What a settled box of items says while folded: how many were applied,
// refused or taken back, as "Changes: 2 applied, 1 not applied".
export function settledWords(items: readonly ProposedItem[]) {
  function count(state: string) {
    return items.filter(
      (p) => (typeof p.state === 'object' ? 'refused' : p.state) === state
    ).length;
  }
  const parts = [
    [count('applied'), 'applied'],
    [count('refused'), 'not applied'],
    [count('withdrawn'), 'taken back']
  ] as const;
  const said = parts.filter(([n]) => n > 0).map(([n, w]) => `${n} ${w}`);
  return `Changes: ${said.join(', ')}`;
}

// The Apply button's words, for how many items are ticked.
export function applyWords(ticked: number, applying: boolean) {
  if (applying) return 'Applying…';
  if (ticked === 0) return 'Apply';
  return ticked === 1 ? 'Apply 1 change' : `Apply ${ticked} changes`;
}

// What the bar applying the Proposal says: why applying failed, where the
// dataset was copied first, or how many changes wait; null for nothing.
export function barWords(
  note: { failed: string } | { backup: string } | null,
  waiting: number
) {
  if (note !== null) {
    return 'failed' in note
      ? note.failed
      : `A copy of the dataset was saved first: ${note.backup}`;
  }
  if (waiting === 0) return null;
  return waiting === 1 ? '1 change waits' : `${waiting} changes wait`;
}
