// Dollars per million input and output tokens, by Claude model:
// first-party API rates as of November 2026. The server counts what a
// request cost by them; Settings shows the assistant's.

export const PRICES: Record<string, { input: number; output: number }> = {
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-fable-5-1': { input: 10, output: 50 }
};

// "$2 / $10 per million tokens in / out", cents shown under a dollar
// ("$0.10"); null for a model without a price.
export function priceWords(model: string) {
  const price = PRICES[model];
  if (price === undefined) return null;
  return `${dollars(price.input)} / ${dollars(price.output)} per million tokens in / out`;
}

function dollars(n: number) {
  return `$${n < 1 ? n.toFixed(2) : n}`;
}
