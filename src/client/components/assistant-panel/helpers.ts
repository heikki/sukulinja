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
