// The support a Citation's Transcription suggests (ADR-0022): for each
// event it gives its person, the person's one Fact of that kind, or for a
// Marriage their one marriage. None where they have none, or two. A
// differing date is suggested too: a source that disagrees is evidence.

import { dateAgrees, isoDate } from './dates';
import type { SupportSuggestion, TranscribedEvent } from './types';

interface Fact {
  id: number;
  tag: string;
  date: string | null;
  familyId: number | null;
}

export function suggestedSupport(
  transcribed: TranscribedEvent[],
  facts: Fact[]
): SupportSuggestion[] {
  return transcribed.flatMap(({ tag, date }) => {
    const found = facts.filter(
      (f) => f.tag === tag && (tag !== 'MARR' || f.familyId !== null)
    );
    if (found.length !== 1) return [];
    const fact = found[0]!;
    const agrees = fact.date === null ? true : dateAgrees(date, fact.date);
    return [{ factId: fact.id, says: isoDate(date), agrees }];
  });
}
