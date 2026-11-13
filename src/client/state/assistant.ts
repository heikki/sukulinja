import { signal } from '@lit-labs/signals';

import { ApiError } from '@/client/dataset-api';
import type { DatasetApi } from '@/client/dataset-api';
import type { AssistantTurnEnd, Spend } from '@/common/types';

import type { Readable } from './selected';

// One exchange: what was asked, what the assistant answered so far, what
// it read for it, and how it ended (null while it runs).
export interface Exchange {
  question: string;
  answer: string;
  reading: string[];
  ended: AssistantTurnEnd | null;
  // Why it failed, if it did.
  failed: string | null;
}

// The conversation with the assistant in this window: kept only here and
// in the app's memory, and gone with a new conversation or the window.
export interface Assistant {
  exchanges: Readable<Exchange[]>;
  // Whether a question is being answered.
  busy: Readable<boolean>;
  // What the conversation has spent; null before anything is asked.
  spend: Readable<Spend | null>;
  // Asks, with the person on screen.
  ask: (text: string, personId: number | null) => Promise<void>;
  // Stops the question being answered.
  stop: () => void;
  // Forgets the conversation and starts a new one.
  restart: () => Promise<void>;
}

export function openAssistant(api: DatasetApi): Assistant {
  const exchanges = signal<Exchange[]>([]);
  const busy = signal(false);
  const spend = signal<Spend | null>(null);
  let conversation: string | null = null;
  let abort: AbortController | null = null;

  // The exchange being answered, as `change` leaves it.
  function update(change: (e: Exchange) => Exchange) {
    const all = exchanges.get();
    const last = all.at(-1);
    if (last !== undefined) exchanges.set([...all.slice(0, -1), change(last)]);
  }

  async function ask(text: string, personId: number | null) {
    if (busy.get()) return;
    busy.set(true);
    abort = new AbortController();
    exchanges.set([
      ...exchanges.get(),
      { question: text, answer: '', reading: [], ended: null, failed: null }
    ]);
    try {
      const events = api.ask({ conversation, text, personId }, abort.signal);
      for await (const event of events) {
        switch (event.type) {
          case 'conversation':
            conversation = event.id;
            break;
          case 'text':
            update((e) => ({ ...e, answer: e.answer + event.text }));
            break;
          case 'reading':
            update((e) => ({ ...e, reading: [...e.reading, event.label] }));
            break;
          case 'done':
            spend.set(event.spend);
            update((e) => ({ ...e, ended: event.ended }));
            break;
          case 'error':
            update((e) => ({ ...e, failed: event.message }));
            break;
        }
      }
    } catch (err) {
      const stopped = abort.signal.aborted;
      if (!stopped && !(err instanceof ApiError)) throw err;
      update((e) => ({
        ...e,
        failed: stopped ? 'Stopped.' : (err as ApiError).message
      }));
    } finally {
      busy.set(false);
      abort = null;
    }
  }

  return {
    exchanges,
    busy,
    spend,
    ask,
    stop() {
      abort?.abort();
    },
    async restart() {
      abort?.abort();
      const id = conversation;
      conversation = null;
      exchanges.set([]);
      spend.set(null);
      if (id !== null) await api.forgetConversation(id).catch(() => undefined);
    }
  };
}
