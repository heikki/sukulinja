// Test support: Claude's answers written out in the test, so the
// assistant's turns run without a request going out.

import type Anthropic from '@anthropic-ai/sdk';

import type { Model, ModelAnswer, ModelRequest } from './model';

// Only the counts are read.
const USAGE = JSON.parse(
  '{"input_tokens":1000,"output_tokens":100}'
) as Anthropic.Beta.BetaUsage;

export function answer(
  content: unknown[],
  stopReason: ModelAnswer['stopReason']
): ModelAnswer {
  return {
    content: content as Anthropic.Beta.BetaContentBlock[],
    stopReason,
    usage: USAGE,
    model: 'claude-opus-5-5'
  };
}

// A tool asked for in an answer.
export function call(id: string, name: string, input: Record<string, unknown>) {
  return { type: 'tool_use', id, name, input };
}

// Answers in turn, writing each answer's text as it goes; keeps what it
// was asked, as it stood then.
export function scripted(answers: ModelAnswer[]) {
  const asked: ModelRequest[] = [];
  async function model(...[request, onText]: Parameters<Model>) {
    asked.push(structuredClone(request));
    const next = answers.shift();
    if (next === undefined) throw new Error('the script has no more answers');
    for (const b of next.content) if (b.type === 'text') onText(b.text);
    return await Promise.resolve(next);
  }
  return { model, asked };
}
