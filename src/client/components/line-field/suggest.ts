// The suggestions for what's typed in a line field: those holding each of
// its words, in any case, in the order given (the most used first), and
// none that is what's typed already.
export function suggestionsFor(
  typed: string,
  choices: readonly string[],
  max: number
) {
  const words = typed
    .toLocaleLowerCase()
    .split(/[\s,]+/u)
    .filter(Boolean);
  if (words.length === 0) return [];
  const exact = typed.trim();
  const found: string[] = [];
  for (const choice of choices) {
    if (choice === exact) continue;
    const lower = choice.toLocaleLowerCase();
    if (!words.every((w) => lower.includes(w))) continue;
    found.push(choice);
    if (found.length === max) break;
  }
  return found;
}
