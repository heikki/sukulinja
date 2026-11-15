// What the assistant asks Claude, behind a port, so the loop (run.ts) can
// be tested with a scripted model.

import type Anthropic from '@anthropic-ai/sdk';

import type { ClaudeModel } from '@/common/assistant-choices';

import { connect, openRouterModel } from '../claude/client';

// The models a declined request falls back from, on the Claude API: Haiku
// has no server-side fallback.
const FALLS_BACK = new Set<ClaudeModel>([
  'claude-opus-5-5',
  'claude-sonnet-5-5'
]);

export interface ModelRequest {
  model: ClaudeModel;
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

// Claude, with the key given or the environment's credentials: the model
// asked for, adaptive thinking at medium effort, streamed. On the Claude
// API a declined request to Opus or Sonnet falls back to the model the API
// picks for it; OpenRouter takes no such fallback.
export function claude(apiKey: string | null): Model {
  const { client, openRouter } = connect(apiKey);
  return async (request, onText, signal) => {
    const fallback = !openRouter && FALLS_BACK.has(request.model);
    const stream = client.beta.messages.stream(
      {
        model: openRouter ? openRouterModel(request.model) : request.model,
        max_tokens: 32000,
        thinking: { type: 'adaptive' },
        output_config: { effort: 'medium' },
        cache_control: { type: 'ephemeral' },
        system: request.system,
        tools: request.tools,
        messages: request.messages,
        ...(fallback
          ? {
              betas: ['server-side-fallback-2026-07-01'],
              fallbacks: 'default' as const
            }
          : {})
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
