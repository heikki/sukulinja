import type { PersonRow } from '@/common/types';

// How long a query has to be before anyone matches it.
const MIN_LEN = 2;

// The people whose name, given names then surname, holds the query, case
// aside, at most `max` of them, in the order given; none for a query too
// short to say much.
export function matchPersons(
  persons: Iterable<PersonRow>,
  query: string,
  max: number
) {
  const q = query.trim().toLowerCase();
  if (q.length < MIN_LEN) return [];
  const out: PersonRow[] = [];
  for (const p of persons) {
    const key = `${p.given ?? ''} ${p.surname ?? ''}`.toLowerCase();
    if (key.includes(q)) {
      out.push(p);
      if (out.length >= max) break;
    }
  }
  return out;
}

// The words of a name, lower-cased.
function wordsOf(text: string) {
  return text
    .toLowerCase()
    .split(/\s+/u)
    .filter((w) => w !== '');
}

// The people whose name is like the one being typed for a new person:
// each word typed starts a word of theirs, so "Anne" finds Anne and Marie
// Anne but not Jeanne. At most `max`, in the order given; none until the
// name says enough.
export function alikePersons(
  persons: Iterable<PersonRow>,
  name: string,
  max: number
) {
  const typed = wordsOf(name);
  if (typed.join('').length < MIN_LEN) return [];
  const out: PersonRow[] = [];
  for (const p of persons) {
    const words = wordsOf(`${p.given ?? ''} ${p.surname ?? ''}`);
    if (typed.every((t) => words.some((w) => w.startsWith(t)))) {
      out.push(p);
      if (out.length >= max) break;
    }
  }
  return out;
}
