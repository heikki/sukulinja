import { signal } from '@lit-labs/signals';

import { ApiError } from '@/client/dataset-api';
import type { DatasetApi } from '@/client/dataset-api';
import { DEFAULT_CHOICE } from '@/common/assistant-choices';
import type { AssistantChoice } from '@/common/assistant-choices';
import type {
  AssistantTurnEnd,
  ProposalItem,
  ShowOn,
  Spend
} from '@/common/types';

import type { Readable } from './selected';

// One exchange: what was asked, what the assistant answered so far, what
// it read for it, where it moved the view, and how it ended (null while it
// runs).
export interface Exchange {
  question: string;
  answer: string;
  reading: string[];
  shown: string[];
  ended: AssistantTurnEnd | null;
  // Why it failed, if it did.
  failed: string | null;
}

// An item of the Proposal as the tab shows it: ticked to be applied, and
// what became of it: waiting, applied, refused with why, or taken back by
// the assistant; and the exchange whose answer proposed it, by its place.
export interface ProposedItem extends ProposalItem {
  exchange: number;
  ticked: boolean;
  state: 'open' | 'applied' | 'withdrawn' | { refused: string };
}

// The conversation with the assistant in this window: kept only here and
// in the app's memory, and gone with a new conversation or the window.
export interface Assistant {
  exchanges: Readable<Exchange[]>;
  // Whether a question is being answered.
  busy: Readable<boolean>;
  // What the conversation has spent; null before anything is asked.
  spend: Readable<Spend | null>;
  // What it has proposed, in order.
  proposal: Readable<ProposedItem[]>;
  // Whether the ticked items are being applied.
  applying: Readable<boolean>;
  // Why applying failed as a whole, or where the dataset was copied before
  // a large Proposal; null for neither.
  applyNote: Readable<{ failed: string } | { backup: string } | null>;
  // Asks, with the person on screen, of the model chosen, for answers in
  // the style chosen (by default Haiku, terse).
  ask: (
    text: string,
    personId: number | null,
    choice?: AssistantChoice
  ) => Promise<void>;
  // Ticks an item to be applied, or not.
  tick: (id: number, ticked: boolean) => void;
  // Applies the ticked items still waiting. Each that's refused says why.
  apply: () => Promise<void>;
  // Stops the question being answered.
  stop: () => void;
  // Forgets the conversation and starts a new one.
  restart: () => Promise<void>;
}

export function openAssistant(
  api: DatasetApi,
  {
    applied: shown = () => undefined,
    show = () => undefined
  }: {
    // After a Proposal applied something, to show the tree as it now is.
    applied?: () => void;
    // Moves the view where the assistant shows.
    show?: (on: ShowOn) => void;
  } = {}
): Assistant {
  const exchanges = signal<Exchange[]>([]);
  const busy = signal(false);
  const spend = signal<Spend | null>(null);
  const proposal = signal<ProposedItem[]>([]);
  const applying = signal(false);
  const applyNote = signal<{ failed: string } | { backup: string } | null>(
    null
  );
  let conversation: string | null = null;
  let abort: AbortController | null = null;

  // The exchange being answered, as `change` leaves it.
  function update(change: (e: Exchange) => Exchange) {
    const all = exchanges.get();
    const last = all.at(-1);
    if (last !== undefined) exchanges.set([...all.slice(0, -1), change(last)]);
  }

  function changeItem(id: number, change: (p: ProposedItem) => ProposedItem) {
    proposal.set(proposal.get().map((p) => (p.id === id ? change(p) : p)));
  }

  async function apply() {
    const ticked = proposal
      .get()
      .filter((p) => p.ticked && p.state === 'open')
      .map((p) => p.id);
    if (conversation === null || ticked.length === 0) return;
    if (busy.get() || applying.get()) return;
    applying.set(true);
    applyNote.set(null);
    try {
      const applied = await api.applyProposal(conversation, ticked);
      for (const { id, refused } of applied.outcomes) {
        changeItem(id, (p) => ({
          ...p,
          ticked: false,
          state: refused === null ? 'applied' : { refused }
        }));
      }
      if (applied.backup !== null) applyNote.set({ backup: applied.backup });
      if (applied.outcomes.some((o) => o.refused === null)) shown();
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      applyNote.set({ failed: err.message });
    } finally {
      applying.set(false);
    }
  }

  async function ask(
    text: string,
    personId: number | null,
    choice: AssistantChoice = DEFAULT_CHOICE
  ) {
    if (busy.get() || applying.get()) return;
    busy.set(true);
    abort = new AbortController();
    exchanges.set([
      ...exchanges.get(),
      {
        question: text,
        answer: '',
        reading: [],
        shown: [],
        ended: null,
        failed: null
      }
    ]);
    try {
      const events = api.ask(
        { conversation, text, personId, ...choice },
        abort.signal
      );
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
          case 'proposed':
            proposal.set([
              ...proposal.get(),
              {
                ...event.item,
                exchange: exchanges.get().length - 1,
                ticked: true,
                state: 'open'
              }
            ]);
            break;
          case 'shown':
            update((e) => ({ ...e, shown: [...e.shown, event.label] }));
            show(event.on);
            break;
          case 'withdrawn':
            changeItem(event.id, (p) => ({
              ...p,
              ticked: false,
              state: 'withdrawn'
            }));
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
    proposal,
    applying,
    applyNote,
    ask,
    tick(id, ticked) {
      changeItem(id, (p) => (p.state === 'open' ? { ...p, ticked } : p));
    },
    apply,
    stop() {
      abort?.abort();
    },
    async restart() {
      abort?.abort();
      const id = conversation;
      conversation = null;
      exchanges.set([]);
      spend.set(null);
      proposal.set([]);
      applyNote.set(null);
      if (id !== null) await api.forgetConversation(id).catch(() => undefined);
    }
  };
}
