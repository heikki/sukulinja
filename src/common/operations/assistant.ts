// The operations of the assistant: a question asked in a conversation,
// told as it's answered, its Proposal's ticked items applied, and a
// conversation forgotten.

import {
  DEFAULT_MODEL,
  DEFAULT_STYLE,
  isAnswerStyle,
  isAssistantModel
} from '@/common/assistant-choices';
import type {
  Applied,
  AssistantEvent,
  AssistantQuestion
} from '@/common/types';

import { answers, streams } from './operation';
import { isId, isIdOrNull, isName } from './read';
import type { Fields } from './read';

// `{ model?, style?, living? }`, by default Haiku, terse, without the
// living; null for a model or style the assistant hasn't.
function choiceOf(body: Fields) {
  const { model = DEFAULT_MODEL, style = DEFAULT_STYLE, living = false } = body;
  return isAssistantModel(model) &&
    isAnswerStyle(style) &&
    typeof living === 'boolean'
    ? { model, style, living }
    : null;
}

// `{ personId, onChart? }`: the person on screen, or null, and everyone
// the chart draws, by default no one; null for anything else.
function seenOf(body: Fields) {
  const { personId = null, onChart = [] } = body;
  if (!isIdOrNull(personId)) return null;
  if (!Array.isArray(onChart) || !onChart.every(isId)) return null;
  return { personId, onChart };
}

export const ASSISTANT_OPERATIONS = {
  // Asks `{ conversation, text, personId, onChart?, model?, style?,
  // living? }`: the conversation's id, or null for a new one; the
  // question; the person on screen, or null; the ids of everyone the chart
  // draws; the model and style chosen, by default Haiku, terse; whether
  // people who may be living go too, by default not.
  // What it tells of the turn as it runs, the conversation's id first.
  ask: streams<AssistantQuestion, AssistantEvent>(
    '{ conversation, text, personId, onChart?, model?, style?, living? }',
    (body) => {
      const { text } = body;
      const conversation = body.conversation ?? null;
      const seen = seenOf(body);
      const choice = choiceOf(body);
      if (typeof text !== 'string' || text.trim() === '') return null;
      if (conversation !== null && typeof conversation !== 'string') {
        return null;
      }
      if (seen === null) return null;
      if (choice === null) return null;
      return { conversation, text: text.trim(), ...seen, ...choice };
    }
  ),

  // Applies the items of the conversation's Proposal by id, in the
  // Proposal's order, through the app's own operations: what each did.
  applyProposal: answers<{ conversation: string; items: number[] }, Applied>(
    '{ conversation, items: [id] }',
    ({ conversation, items }) =>
      isName(conversation) &&
      Array.isArray(items) &&
      items.length > 0 &&
      items.every(isId)
        ? { conversation, items }
        : null
  ),

  // Forgets a conversation.
  forgetConversation: answers<{ id: string }, undefined>('{ id }', ({ id }) =>
    isName(id) ? { id } : null
  )
};
