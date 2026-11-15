// The assistant's operations (common/operations/assistant): a question
// asked in a conversation, told as it's answered, its Proposal applied
// through the app's own operations, and a conversation forgotten.

import type { ASSISTANT_OPERATIONS } from '@/common/operations/assistant';
import type { AssistantEvent, AssistantQuestion } from '@/common/types';

import { madeVia } from '../changes/via';
import type { KeyStore } from '../claude/key';
import { keyStatus } from '../claude/key-operations';
import type { DatasetServices } from '../datasets/services';
import { Refusal } from '../operations';
import type { Handlers } from '../operations';
import { openConversations } from './conversations';
import type { Conversation } from './conversations';
import type { Model } from './model';
import type { RunOperation } from './proposal';
import { runTurn } from './run';
import { openTreeView } from './tree-view';

export interface AssistantDeps {
  keyStore: KeyStore;
  // Claude with the key kept, or null for the environment's credentials.
  model: (apiKey: string | null) => Model;
}

export const NO_KEY =
  'The assistant needs an Anthropic API key. Add one in Settings.';

// What `run` tells, as it's told, until it's done. It runs to its end
// whether or not anyone reads on.
function told<T>(run: (tell: (value: T) => void) => Promise<void>) {
  return new ReadableStream<T>({
    start(controller) {
      void run((value) => {
        controller.enqueue(value);
      }).finally(() => {
        controller.close();
      });
    }
  });
}

// `run` runs one of the dataset's own operations, as its route would: a
// Proposal is applied through it.
export function assistantOperations(
  services: DatasetServices,
  deps: AssistantDeps,
  run: RunOperation
): Handlers<typeof ASSISTANT_OPERATIONS> {
  const conversations = openConversations();

  // Runs the turn, telling it as it goes; the conversation is the
  // caller's to hold for its length.
  async function turn(
    conversation: Conversation,
    asked: AssistantQuestion,
    signal: AbortSignal,
    tell: (event: AssistantEvent) => void
  ) {
    if ((await keyStatus(deps.keyStore)).source === null) {
      throw new Error(NO_KEY);
    }
    const model = deps.model(await deps.keyStore.get());
    const spend = await runTurn({
      model,
      choice: { model: asked.model, style: asked.style },
      view: openTreeView(services, { personId: asked.personId }),
      messages: conversation.messages,
      proposal: conversation.proposal,
      text: asked.text,
      spend: conversation.spend,
      signal,
      tell
    });
    conversations.spent(conversation.id, spend);
  }

  return {
    // The conversation's id first, then the turn as it runs; an error
    // ends it, told as one.
    ask(asked, signal) {
      const conversation = conversations.take(asked.conversation);
      if (conversation === null) {
        throw new Refusal(409, 'Wait for the answer before asking again.');
      }
      return told<AssistantEvent>(async (tell) => {
        tell({ type: 'conversation', id: conversation.id });
        try {
          await turn(conversation, asked, signal, tell);
        } catch (e) {
          tell({
            type: 'error',
            message: e instanceof Error ? e.message : "Claude couldn't answer."
          });
        } finally {
          conversations.release(conversation.id);
        }
      });
    },

    // The ticked items, each made via the assistant; a large Proposal's
    // dataset copied first.
    async applyProposal({ conversation: id, items }) {
      const conversation = conversations.takeKept(id);
      if (conversation === null) {
        throw new Refusal(
          409,
          'This conversation is answering, or was forgotten.'
        );
      }
      try {
        const { proposal } = conversation;
        const backup = proposal.isLarge(items) ? services.backUp() : null;
        const outcomes = await madeVia(
          'assistant',
          async () => await proposal.apply(items, run)
        );
        return { outcomes, backup };
      } finally {
        conversations.release(id);
      }
    },

    forgetConversation({ id }) {
      conversations.forget(id);
    }
  };
}
