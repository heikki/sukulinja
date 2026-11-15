// One turn of a conversation with the assistant: the question goes to
// Claude with the operations as tools; each read Claude calls runs against
// the dataset, and its answer goes back, until Claude answers. A write only
// adds to the conversation's Proposal, and a show only tells the app where
// to move the view: nothing here changes the dataset.

import type Anthropic from '@anthropic-ai/sdk';

import type { AnswerStyle, ClaudeModel } from '@/common/assistant-choices';
import type { AssistantEvent, Spend } from '@/common/types';

import { addSpend } from '../claude/client';
import type { Model } from './model';
import {
  batchOf,
  MAX_BATCH,
  operationNamed,
  READ_OPERATIONS,
  SHOW_OPERATIONS,
  showNamed,
  toolsOf,
  WITHDRAW,
  WRITE_OPERATIONS,
  writeNamed
} from './operations/catalogue';
import type {
  AnyShowOperation,
  AnyWriteOperation,
  Asked
} from './operations/operation';
import type { Proposal } from './proposal';
import type { TreeView } from './tree-view';

// How many requests one turn may make.
const MAX_STEPS = 25;

const TOOLS = toolsOf(READ_OPERATIONS, WRITE_OPERATIONS, SHOW_OPERATIONS);

const SYSTEM = `You are the assistant in Sukulinja, a genealogy app for a Finnish family tree. Its user researches the family from Finnish church books (rippikirjat, kastekirjat), mostly of the 1700s and 1800s.

Each question starts with who is selected on screen and who the chart draws; when the user says "these" or "everyone shown", they mean the chart's people. You read the tree through your tools and answer from what they give. Say so when the tree doesn't tell, rather than guess, and tell what you found apart from what you conclude: a place name or a house number may have meant something else in another era, and that is a research question, not a fact.

You don't change the tree yourself. When the user asks for a change, or the answer is one, propose it with the write tools: each adds an item to the Proposal, which the user reads, ticks and applies in the app, and only then is it written, by the app's own rules. Propose only what the user asked for or agreed to, one item for each change, with the reason the tree or its sources give. Say in a sentence what you proposed; the user sees the items themselves. When the user wants an item changed or dropped, take it back and propose it again as they want it. A change the tools can't make is one the app can't make yet: say so.

You can move what the user sees: select someone, or open one of their sources at its church-book page. That changes no data and happens at once; do it when asked, or when seeing it helps the answer, not for every person you read.

For a change across many people, go through them in parts of about 20–30 people an answer, propose each part's changes as one batch with the _many tools, and say where you got to, so the user can say to go on.

Tidy the tree, not its sources: never propose rewriting what a source says. A conclusion only research can settle (that two houses were one, that two people are the same) is a Reminder for the user, not an edit.

Answer in the language the user writes in, naming people with their years, without greeting, restating the question or closing offers. Don't repeat what a proposed item already says. Write plain text: the app shows no Markdown.`;

// How much an answer says, as the user chose.
const STYLES: Record<AnswerStyle, string> = {
  terse:
    'Be terse: answer first, in a few short sentences, with no recap of what you read.',
  normal: 'Answer first, then what it rests on, in a short paragraph or two.',
  thorough:
    'Answer thoroughly: what you found, in which sources, what you conclude from it and how sure that is, and what is left open.'
};

// Said unless the person chose to include the living.
const LIVING_LEFT_OUT =
  "People who may be living are left out of what the tools give, unless they're the person on screen; don't try to work around it.";

// The system prompt for answers in the style chosen, with or without the
// living.
export function systemFor(style: AnswerStyle, living = false) {
  const parts = [SYSTEM, ...(living ? [] : [LIVING_LEFT_OUT]), STYLES[style]];
  return parts.join('\n\n');
}

// Everyone the chart draws, by name, years and id, all of them; who's left
// out counted.
export function chartWords(view: TreeView) {
  const ids = view.onScreen.onChart ?? [];
  if (ids.length === 0) return null;
  const named = ids.filter((id) => !view.hidden(id)).map((id) => view.ref(id));
  const left = ids.length - named.length;
  const tail = left > 0 ? ` (${left} who may be living left out)` : '';
  return `On the chart${tail}: ${JSON.stringify(named)}`;
}

// The question as Claude gets it: what's on screen first, what became of
// the Proposal since, then the words.
function question(
  view: TreeView,
  proposal: Proposal,
  text: string
): Anthropic.Beta.BetaMessageParam {
  const id = view.onScreen.personId;
  const onScreen =
    id === null
      ? 'On screen: no one selected.'
      : `On screen: ${JSON.stringify(view.ref(id))}`;
  const chart = chartWords(view);
  const news = proposal.news();
  return {
    role: 'user',
    content: [
      { type: 'text', text: onScreen },
      ...(chart === null ? [] : [{ type: 'text' as const, text: chart }]),
      ...(news === null ? [] : [{ type: 'text' as const, text: news }]),
      { type: 'text', text }
    ]
  };
}

function result(
  call: Anthropic.Beta.BetaToolUseBlock,
  content: string,
  isError = false
): Anthropic.Beta.BetaToolResultBlockParam {
  return {
    type: 'tool_result',
    tool_use_id: call.id,
    content,
    ...(isError ? { is_error: true } : {})
  };
}

// A write: its item added to the Proposal and told, or why it can't be.
function propose(
  { view, proposal }: { view: TreeView; proposal: Proposal },
  op: AnyWriteOperation,
  call: Anthropic.Beta.BetaToolUseBlock,
  tell: (event: AssistantEvent) => void
) {
  const { reason, ...input } = call.input as { reason: string };
  const asked = op.asks(view, input as never);
  const added = 'rejected' in asked ? asked : proposal.propose(asked, reason);
  if ('rejected' in added) return result(call, added.rejected, true);
  tell({ type: 'proposed', item: added });
  return result(call, `Proposed as item #${added.id}.`);
}

// A batch: the changes that can be proposed added as one item and told,
// with those left out and why; or why none can be.
function proposeBatch(
  { view, proposal }: { view: TreeView; proposal: Proposal },
  op: AnyWriteOperation,
  call: Anthropic.Beta.BetaToolUseBlock,
  tell: (event: AssistantEvent) => void
) {
  const { reason, changes } = call.input as {
    reason: string;
    changes: unknown[];
  };
  if (changes.length > MAX_BATCH) {
    return result(call, `At most ${MAX_BATCH} changes in one batch.`, true);
  }
  const asks: Asked[] = [];
  const leftOut: string[] = [];
  changes.forEach((input, i) => {
    const asked = op.asks(view, input as never);
    if ('rejected' in asked) {
      leftOut.push(`#${i + 1}: ${asked.rejected}`);
    } else {
      asks.push(asked);
    }
  });
  if (asks.length === 0) {
    return result(call, `None can be proposed. ${leftOut.join('; ')}`, true);
  }
  const label = asks.length === 1 ? asks[0]!.label : op.many!(asks.length);
  const added = proposal.proposeAll(asks, label, reason);
  if ('rejected' in added) return result(call, added.rejected, true);
  tell({ type: 'proposed', item: added });
  const left = leftOut.length === 0 ? '' : ` Left out: ${leftOut.join('; ')}`;
  return result(call, `Proposed ${asks.length} as item #${added.id}.${left}`);
}

// A show: the view moved and told, or why it can't be.
function show(
  view: TreeView,
  op: AnyShowOperation,
  call: Anthropic.Beta.BetaToolUseBlock,
  tell: (event: AssistantEvent) => void
) {
  const shown = op.shows(view, call.input as never);
  if ('rejected' in shown) return result(call, shown.rejected, true);
  tell({ type: 'shown', ...shown });
  return result(call, `${shown.label}.`);
}

// Taking an item back, told.
function withdraw(
  proposal: Proposal,
  call: Anthropic.Beta.BetaToolUseBlock,
  tell: (event: AssistantEvent) => void
) {
  const { item } = call.input as { item: number };
  if (!proposal.withdraw(item)) {
    return result(call, `No item #${item} waiting in the Proposal.`, true);
  }
  tell({ type: 'withdrawn', id: item });
  return result(call, `Item #${item} taken back.`);
}

async function answerTool(
  view: TreeView,
  proposal: Proposal,
  call: Anthropic.Beta.BetaToolUseBlock,
  tell: (event: AssistantEvent) => void
): Promise<Anthropic.Beta.BetaToolResultBlockParam> {
  if (call.name === WITHDRAW) return withdraw(proposal, call, tell);
  const shows = showNamed(call.name);
  if (shows !== null) return show(view, shows, call, tell);
  const batch = batchOf(call.name);
  if (batch !== null) {
    return proposeBatch({ view, proposal }, batch, call, tell);
  }
  const write = writeNamed(call.name);
  const op = operationNamed(call.name);
  try {
    if (write !== null) {
      return propose({ view, proposal }, write, call, tell);
    }
    if (op === null) return result(call, `No tool named ${call.name}.`, true);
    const input = call.input as never;
    tell({ type: 'reading', label: op.label(input) });
    return result(call, JSON.stringify(await op.run(view, input)));
  } catch (e) {
    return result(
      call,
      e instanceof Error ? e.message : 'The tool failed.',
      true
    );
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
  // Which Claude answers, and how much it says.
  choice: { model: ClaudeModel; style: AnswerStyle; living: boolean };
  view: TreeView;
  messages: Anthropic.Beta.BetaMessageParam[];
  // What the conversation has proposed, which its writes add to.
  proposal: Proposal;
  text: string;
  spend: Spend;
  signal: AbortSignal;
  tell: (event: AssistantEvent) => void;
}): Promise<Spend> {
  const { model, choice, view, messages, proposal, tell, signal } = options;
  const system = systemFor(choice.style, choice.living);
  let spend = options.spend;
  messages.push(question(view, proposal, options.text));
  for (let step = 0; step < MAX_STEPS; step++) {
    // eslint-disable-next-line no-await-in-loop -- each request needs the one before it answered
    const answer = await model(
      { model: choice.model, system, tools: TOOLS, messages },
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
      calls.map(async (c) => await answerTool(view, proposal, c, tell))
    );
    messages.push({ role: 'user', content: results });
  }
  tell({ type: 'done', spend, ended: 'too-many-steps' });
  return spend;
}
