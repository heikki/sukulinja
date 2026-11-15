// The operations of the assistant: a question asked in a conversation,
// told as it's answered, its Proposal's ticked items applied, and a
// conversation forgotten.

import type {
  Applied,
  AssistantEvent,
  AssistantQuestion
} from '@/common/types';

import { answers, streams } from './operation';
import { isId, isIdOrNull, isName } from './read';

export const ASSISTANT_OPERATIONS = {
  // Asks `{ conversation, text, personId }`: the conversation's id, or
  // null for a new one; the question; the person on screen, or null.
  // What it tells of the turn as it runs, the conversation's id first.
  ask: streams<AssistantQuestion, AssistantEvent>(
    '{ conversation, text, personId }',
    (body) => {
      const { text } = body;
      const conversation = body.conversation ?? null;
      const personId = body.personId ?? null;
      if (typeof text !== 'string' || text.trim() === '') return null;
      if (conversation !== null && typeof conversation !== 'string') {
        return null;
      }
      if (!isIdOrNull(personId)) return null;
      return { conversation, text: text.trim(), personId };
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
