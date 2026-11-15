// The assistant's conversations, kept in memory only: never written to
// disk, gone when the app closes or a conversation is forgotten. The
// oldest go first past a few, so nothing grows without end.

import type Anthropic from '@anthropic-ai/sdk';

import type { Spend } from '@/common/types';

import { NO_SPEND } from '../claude/client';
import { openProposal } from './proposal';
import type { Proposal } from './proposal';

const KEPT = 10;

export interface Conversation {
  id: string;
  messages: Anthropic.Beta.BetaMessageParam[];
  spend: Spend;
  // What it has proposed, and what of that was applied.
  proposal: Proposal;
  // Set while a turn runs, or its Proposal is applied: one at a time.
  busy: boolean;
}

export function openConversations() {
  const kept = new Map<string, Conversation>();

  // The conversation by id, or a new one for null or one forgotten.
  function find(id: string | null): Conversation {
    const found = id === null ? undefined : kept.get(id);
    if (found !== undefined) {
      kept.delete(found.id);
      kept.set(found.id, found);
      return found;
    }
    const made: Conversation = {
      id: crypto.randomUUID(),
      messages: [],
      spend: NO_SPEND,
      proposal: openProposal(),
      busy: false
    };
    kept.set(made.id, made);
    for (const old of kept.keys()) {
      if (kept.size <= KEPT) break;
      kept.delete(old);
    }
    return made;
  }

  return {
    // The conversation, held for a turn; null while a turn runs in it.
    // One forgotten is a new one.
    take(id: string | null): Conversation | null {
      const conversation = find(id);
      if (conversation.busy) return null;
      conversation.busy = true;
      return conversation;
    },
    // The conversation kept by id, held while its Proposal is applied;
    // null for none, or while it's busy.
    takeKept(id: string): Conversation | null {
      const conversation = kept.get(id);
      if (conversation === undefined || conversation.busy) return null;
      conversation.busy = true;
      return conversation;
    },
    // What it has spent, after a turn.
    spent(id: string, spend: Spend) {
      const conversation = kept.get(id);
      if (conversation !== undefined) conversation.spend = spend;
    },
    // Lets the next turn in.
    release(id: string) {
      const conversation = kept.get(id);
      if (conversation !== undefined) conversation.busy = false;
    },
    forget(id: string) {
      kept.delete(id);
    }
  };
}

export type Conversations = ReturnType<typeof openConversations>;
