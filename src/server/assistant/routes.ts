// The assistant's routes: a question asked in a conversation, answered as
// an NDJSON stream of AssistantEvents, and a conversation forgotten.

import type { AssistantEvent } from '@/common/types';

import type { KeyStore } from '../claude/key';
import { keyStatus } from '../claude/key-routes';
import type { DatasetServices } from '../datasets/services';
import { openConversations } from './conversations';
import type { Conversation } from './conversations';
import type { Model } from './model';
import { runTurn } from './run';
import { openTreeView } from './tree-view';

export interface AssistantDeps {
  keyStore: KeyStore;
  // Claude with the key kept, or null for the environment's credentials.
  model: (apiKey: string | null) => Model;
}

export const NO_KEY =
  'The assistant needs an Anthropic API key. Add one in Settings.';

interface Asked {
  conversation: string | null;
  text: string;
  personId: number | null;
}

function isText(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== '';
}

function isIdOrNull(v: unknown): v is string | null {
  return v === null || typeof v === 'string';
}

function isPersonOrNull(v: unknown): v is number | null {
  return v === null || Number.isInteger(v);
}

// `{ conversation, text, personId }`: the conversation's id, or null for a
// new one; the question; the person on screen, or null.
function readAsked(body: unknown): Asked | null {
  if (typeof body !== 'object' || body === null) return null;
  const fields = body as Record<string, unknown>;
  const { text } = fields;
  const conversation = fields.conversation ?? null;
  const personId = fields.personId ?? null;
  if (!isText(text) || !isIdOrNull(conversation)) return null;
  if (!isPersonOrNull(personId)) return null;
  return { conversation, text: text.trim(), personId };
}

const CONVERSATION_RE = /^\/api\/assistant\/(?<id>[\w-]+)$/u;

export function assistantRoutes(
  services: DatasetServices,
  deps: AssistantDeps
) {
  const conversations = openConversations();

  // Runs the turn, telling it as it goes; the conversation is the
  // caller's to hold for its length.
  async function turn(
    conversation: Conversation,
    asked: Asked,
    signal: AbortSignal,
    tell: (event: AssistantEvent) => void
  ) {
    if ((await keyStatus(deps.keyStore)).source === null) {
      throw new Error(NO_KEY);
    }
    const model = deps.model(await deps.keyStore.get());
    const spend = await runTurn({
      model,
      view: openTreeView(services, { personId: asked.personId }),
      messages: conversation.messages,
      text: asked.text,
      spend: conversation.spend,
      signal,
      tell
    });
    conversations.spent(conversation.id, spend);
  }

  function ask(asked: Asked, signal: AbortSignal) {
    const conversation = conversations.take(asked.conversation);
    if (conversation === null) {
      return new Response('Wait for the answer before asking again.', {
        status: 409
      });
    }
    const enc = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        function tell(event: AssistantEvent) {
          controller.enqueue(enc.encode(`${JSON.stringify(event)}\n`));
        }
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
          controller.close();
        }
      }
    });
    return new Response(stream, {
      headers: { 'content-type': 'application/x-ndjson' }
    });
  }

  // POST /api/assistant asks `{ conversation, text, personId }`;
  // DELETE /api/assistant/:id forgets a conversation. Null for any other
  // path.
  return async (req: Request, rest: string) => {
    if (rest === '/api/assistant') {
      if (req.method !== 'POST') {
        return new Response('method not allowed', { status: 405 });
      }
      const asked = readAsked(await req.json().catch(() => null));
      return asked === null
        ? new Response('expected { conversation, text, personId }', {
            status: 400
          })
        : ask(asked, req.signal);
    }
    const m = CONVERSATION_RE.exec(rest);
    if (m === null) return null;
    if (req.method !== 'DELETE') {
      return new Response('method not allowed', { status: 405 });
    }
    conversations.forget(m.groups!.id!);
    return new Response(null, { status: 204 });
  };
}
