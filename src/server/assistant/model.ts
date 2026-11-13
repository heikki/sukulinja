// What the assistant asks Claude, behind a port, so the loop (run.ts) can
// be tested with a scripted model.

import type Anthropic from '@anthropic-ai/sdk';

import { connect, openRouterModel } from '../claude/client';

export const MODEL = 'claude-opus-5-5';

export interface ModelRequest {
  system: string;
  tools: Anthropic.Beta.BetaTool[];
  messages: Anthropic.Beta.BetaMessageParam[];
}

// One answer: its blocks, passed back unchanged on the next request
// (thinking blocks too), why it stopped, and what it cost.
export interface ModelAnswer {
  content: Anthropic.Beta.BetaContentBlock[];
  stopReason: Anthropic.Beta.BetaStopReason | null;
  usage: Anthropic.Beta.BetaUsage;
  model: string;
}

// Asks once, telling each piece of text as it's written.
export type Model = (
  request: ModelRequest,
  onText: (text: string) => void,
  signal: AbortSignal
) => Promise<ModelAnswer>;

// Claude, with the key given or the environment's credentials: Opus 5.5,
// adaptive thinking at medium effort, streamed. On the Claude API a
// declined request falls back to the model the API picks for it;
// OpenRouter takes no such fallback.
export function claude(apiKey: string | null): Model {
  const { client, openRouter } = connect(apiKey);
  return async (request, onText, signal) => {
    const stream = client.beta.messages.stream(
      {
        model: openRouter ? openRouterModel(MODEL) : MODEL,
        max_tokens: 32000,
        thinking: { type: 'adaptive' },
        output_config: { effort: 'medium' },
        cache_control: { type: 'ephemeral' },
        system: request.system,
        tools: request.tools,
        messages: request.messages,
        ...(openRouter
          ? {}
          : {
              betas: ['server-side-fallback-2026-07-01'],
              fallbacks: 'default' as const
            })
      },
      { signal }
    );
    stream.on('text', onText);
    const message = await stream.finalMessage();
    return {
      content: message.content,
      stopReason: message.stop_reason,
      usage: message.usage,
      model: message.model
    };
  };
}
