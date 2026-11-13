// One turn of a conversation with the assistant: the question goes to
// Claude with the read operations as tools; each tool Claude calls runs
// against the dataset, and its answer goes back, until Claude answers.
// It only reads: nothing here changes the dataset.

import type Anthropic from '@anthropic-ai/sdk';

import type { AssistantEvent, Spend } from '@/common/types';

import { addSpend } from '../claude/client';
import type { Model } from './model';
import {
  operationNamed,
  READ_OPERATIONS,
  toolsOf
} from './operations/catalogue';
import type { TreeView } from './tree-view';

// How many requests one turn may make.
const MAX_STEPS = 25;

const TOOLS = toolsOf(READ_OPERATIONS);

export const SYSTEM = `You are the assistant in Sukulinja, a genealogy app for a Finnish family tree. Its user researches the family from Finnish church books (rippikirjat, kastekirjat), mostly of the 1700s and 1800s.

You read the tree through your tools and answer from what they give. Say so when the tree doesn't tell, rather than guess, and tell what you found apart from what you conclude: a place name or a house number may have meant something else in another era, and that is a research question, not a fact.

You can't change the tree yet. When the answer would be a change, say what you would change and why, and that it's for the user to make in the app.

People who may be living are left out of what the tools give, unless they're the person on screen; don't try to work around it.

Answer in the language the user writes in, briefly, naming people with their years.`;

// The question as Claude gets it: what's on screen first, then the words.
function question(
  view: TreeView,
  text: string
): Anthropic.Beta.BetaMessageParam {
  const id = view.onScreen.personId;
  const onScreen =
    id === null
      ? 'On screen: no one selected.'
      : `On screen: ${JSON.stringify(view.ref(id))}`;
  return {
    role: 'user',
    content: [
      { type: 'text', text: onScreen },
      { type: 'text', text }
    ]
  };
}

async function answerTool(
  view: TreeView,
  call: Anthropic.Beta.BetaToolUseBlock,
  tell: (event: AssistantEvent) => void
): Promise<Anthropic.Beta.BetaToolResultBlockParam> {
  const op = operationNamed(call.name);
  if (op === null) {
    return {
      type: 'tool_result',
      tool_use_id: call.id,
      content: `No tool named ${call.name}.`,
      is_error: true
    };
  }
  const input = call.input as never;
  tell({ type: 'reading', label: op.label(input) });
  try {
    const answer = await op.run(view, input);
    return {
      type: 'tool_result',
      tool_use_id: call.id,
      content: JSON.stringify(answer)
    };
  } catch (e) {
    return {
      type: 'tool_result',
      tool_use_id: call.id,
      content: e instanceof Error ? e.message : 'The tool failed.',
      is_error: true
    };
  }
}

// Answers the tool calls of an answer cut short, so the conversation can
// go on: each one needs its result before the next question.
function closeCalls(
  messages: Anthropic.Beta.BetaMessageParam[],
  content: Anthropic.Beta.BetaContentBlock[]
) {
  const open = content.filter((b) => b.type === 'tool_use');
  if (open.length === 0) return;
  messages.push({
    role: 'user',
    content: open.map((b) => ({
      type: 'tool_result' as const,
      tool_use_id: b.id,
      content: 'Not run: the answer was cut short.',
      is_error: true
    }))
  });
}

// Runs the turn on `messages`, the conversation so far, adding to it the
// question, Claude's answers and the tools' answers as they come.
export async function runTurn(options: {
  model: Model;
  view: TreeView;
  messages: Anthropic.Beta.BetaMessageParam[];
  text: string;
  spend: Spend;
  signal: AbortSignal;
  tell: (event: AssistantEvent) => void;
}): Promise<Spend> {
  const { model, view, messages, tell, signal } = options;
  let spend = options.spend;
  messages.push(question(view, options.text));
  for (let step = 0; step < MAX_STEPS; step++) {
    // eslint-disable-next-line no-await-in-loop -- each request needs the one before it answered
    const answer = await model(
      { system: SYSTEM, tools: TOOLS, messages },
      (text) => {
        tell({ type: 'text', text });
      },
      signal
    );
    spend = addSpend(spend, answer.model, answer.usage);
    messages.push({ role: 'assistant', content: answer.content });
    if (answer.stopReason === 'refusal') {
      tell({ type: 'done', spend, ended: 'declined' });
      return spend;
    }
    if (answer.stopReason === 'max_tokens') {
      closeCalls(messages, answer.content);
      tell({ type: 'done', spend, ended: 'too-long' });
      return spend;
    }
    if (answer.stopReason === 'pause_turn') continue;
    const calls = answer.content.filter(
      (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use'
    );
    if (answer.stopReason !== 'tool_use' || calls.length === 0) {
      tell({ type: 'done', spend, ended: 'answered' });
      return spend;
    }
    // eslint-disable-next-line no-await-in-loop -- the tools' answers go back with the next request
    const results = await Promise.all(
      calls.map(async (c) => await answerTool(view, c, tell))
    );
    messages.push({ role: 'user', content: results });
  }
  tell({ type: 'done', spend, ended: 'too-many-steps' });
  return spend;
}
