// Asking Claude: the client and its credentials, and what a request costs.
// Shared by the scan Reader (scripts/vision) and the assistant.
// Credentials come from the key given, else the environment or an
// `ant auth login` profile, never from the repo; with only
// OPENROUTER_API_KEY set, requests go through OpenRouter's
// Anthropic-shaped endpoint instead.

import Anthropic from '@anthropic-ai/sdk';

// Dollars per million input and output tokens, first-party API rates as of
// October 2026.
const PRICES: Record<string, { input: number; output: number }> = {
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-fable-5-1': { input: 10, output: 50 }
};

// What a model was asked and spent.
export interface Spend {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  // Null when the model's price isn't known here.
  dollars: number | null;
}

export const NO_SPEND: Spend = {
  calls: 0,
  inputTokens: 0,
  outputTokens: 0,
  dollars: 0
};

// The tokens of one answer, as the API counts them.
export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

// `spend` with one more call to `model` added.
export function addSpend(spend: Spend, model: string, usage: Usage): Spend {
  const input =
    usage.input_tokens +
    (usage.cache_creation_input_tokens ?? 0) +
    (usage.cache_read_input_tokens ?? 0);
  const price = PRICES[claudeModel(model)];
  return {
    calls: spend.calls + 1,
    inputTokens: spend.inputTokens + input,
    outputTokens: spend.outputTokens + usage.output_tokens,
    dollars:
      price === undefined || spend.dollars === null
        ? null
        : spend.dollars +
          (input * price.input + usage.output_tokens * price.output) / 1e6
  };
}

const OPENROUTER = 'https://openrouter.ai/api';

// Where requests go: the Claude API with `apiKey`, or with the
// environment's credentials; or OpenRouter when its key is the only one
// there is.
export function connect(apiKey: string | null = null) {
  if (apiKey !== null) {
    return { client: new Anthropic({ apiKey }), openRouter: false };
  }
  const env = process.env;
  const anthropic =
    env.ANTHROPIC_API_KEY !== undefined ||
    env.ANTHROPIC_AUTH_TOKEN !== undefined;
  const openRouterKey = env.OPENROUTER_API_KEY;
  if (anthropic || openRouterKey === undefined) {
    return { client: new Anthropic(), openRouter: false };
  }
  const client = new Anthropic({
    authToken: openRouterKey,
    baseURL: OPENROUTER
  });
  return { client, openRouter: true };
}

// OpenRouter names models "anthropic/claude-sonnet-5.5".
export function openRouterModel(model: string) {
  return `anthropic/${model.replace(/-(?<major>\d+)-(?<minor>\d+)$/, '-$<major>.$<minor>')}`;
}

// The model's own name, as OpenRouter or the API served it.
export function claudeModel(served: string) {
  return served.replace(/^anthropic\//, '').replace(/\./g, '-');
}
