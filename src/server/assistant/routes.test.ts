import { afterEach, beforeEach, expect, test } from 'bun:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type Anthropic from '@anthropic-ai/sdk';

import type { AssistantEvent } from '@/common/types';

import { openCitations } from '../citations';
import { memoryAstia } from '../citations/testing';
import { memoryKeyStore } from '../claude/key';
import { openDb } from '../datasets/db';
import { openServices } from '../datasets/services';
import { parseGedcom } from '../gedcom/parser';
import { importGedcom } from '../import/gedcom';
import type { Model, ModelAnswer, ModelRequest } from './model';
import { assistantRoutes, NO_KEY } from './routes';

const SCANS = openCitations(join(tmpdir(), 'assistant-routes-unread'), {
  astia: memoryAstia({}),
  datasets: async () => await Promise.resolve([])
});

const GEDCOM = [
  '0 @I1@ INDI',
  '1 NAME Matti /Esimerkki/',
  '1 BIRT',
  '2 DATE 1801',
  '1 DEAT',
  '2 DATE 1860',
  ''
].join('\n');

// Only the counts are read.
const USAGE = JSON.parse(
  '{"input_tokens":1000,"output_tokens":100}'
) as Anthropic.Beta.BetaUsage;

function answer(
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

// Answers in turn, writing each answer's text as it goes; keeps what it
// was asked, as it stood then.
function scripted(answers: ModelAnswer[]) {
  const asked: ModelRequest[] = [];
  async function model(...[request, onText]: Parameters<Model>) {
    asked.push(structuredClone(request));
    const next = answers.shift()!;
    for (const b of next.content) if (b.type === 'text') onText(b.text);
    return await Promise.resolve(next);
  }
  return { model, asked };
}

const saved = process.env.ANTHROPIC_API_KEY;
beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});
afterEach(() => {
  if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
});

function routesWith(model: Model, key: string | null = 'sk-test') {
  const db = openDb(':memory:');
  importGedcom(db, parseGedcom(GEDCOM), () => null);
  const keys: Array<string | null> = [];
  const route = assistantRoutes(
    openServices(db, SCANS.forDataset(db), tmpdir()),
    {
      keyStore: memoryKeyStore(key),
      model: (k) => {
        keys.push(k);
        return model;
      }
    }
  );
  return { route, keys };
}

async function ask(
  route: ReturnType<typeof assistantRoutes>,
  body: Record<string, unknown>
) {
  const res = await route(
    new Request('http://app/api/assistant', {
      method: 'POST',
      body: JSON.stringify(body)
    }),
    '/api/assistant'
  );
  const text = await res!.text();
  return text
    .split('\n')
    .filter((l) => l !== '')
    .map((l) => JSON.parse(l) as AssistantEvent);
}

test('a question reads through the tools and is answered', async () => {
  const { model, asked } = scripted([
    answer(
      [
        {
          type: 'tool_use',
          id: 't1',
          name: 'find_persons',
          input: { name: 'Matti', bornFrom: null, bornTo: null }
        }
      ],
      'tool_use'
    ),
    answer([{ type: 'text', text: 'Matti Esimerkki (1801–1860).' }], 'end_turn')
  ]);
  const { route, keys } = routesWith(model);
  const events = await ask(route, {
    conversation: null,
    text: 'Kuka on Matti?',
    personId: 1
  });
  expect(keys).toEqual(['sk-test']);
  expect(events[0]!.type).toBe('conversation');
  expect(events.slice(1)).toEqual([
    { type: 'reading', label: 'Finding people named Matti' },
    { type: 'text', text: 'Matti Esimerkki (1801–1860).' },
    {
      type: 'done',
      ended: 'answered',
      spend: {
        calls: 2,
        inputTokens: 2000,
        outputTokens: 200,
        dollars: 0.012
      }
    }
  ]);
  // The question carries what's on screen; the tool's answer goes back.
  expect(asked[0]!.messages[0]).toEqual({
    role: 'user',
    content: [
      {
        type: 'text',
        text: 'On screen: {"id":1,"name":"Matti Esimerkki","born":1801,"died":1860}'
      },
      { type: 'text', text: 'Kuka on Matti?' }
    ]
  });
  const results = asked[1]!.messages[2]!.content as Array<{
    type: string;
    content: string;
  }>;
  expect(results[0]!.type).toBe('tool_result');
  expect(JSON.parse(results[0]!.content)).toMatchObject({ matched: 1 });
});

test('a conversation goes on with what was said before', async () => {
  const { model, asked } = scripted([
    answer([{ type: 'text', text: 'Hei.' }], 'end_turn'),
    answer([{ type: 'text', text: 'Taas.' }], 'end_turn')
  ]);
  const { route } = routesWith(model);
  const first = await ask(route, { text: 'Hei', personId: null });
  const id = (first[0] as { id: string }).id;
  const second = await ask(route, { conversation: id, text: 'Taas' });
  expect(second[0]).toEqual({ type: 'conversation', id });
  expect(asked[1]!.messages).toHaveLength(3);
  expect(second.at(-1)).toMatchObject({ spend: { calls: 2 } });
});

test('says where to add a key when there is none', async () => {
  const { model } = scripted([]);
  const { route } = routesWith(model, null);
  const events = await ask(route, { text: 'Hei' });
  expect(events.at(-1)).toEqual({ type: 'error', message: NO_KEY });
});

test('a declined question ends the turn', async () => {
  const { model } = scripted([answer([], 'refusal')]);
  const { route } = routesWith(model);
  const events = await ask(route, { text: 'Hei' });
  expect(events.at(-1)).toMatchObject({ type: 'done', ended: 'declined' });
});

test('refuses a question with no words', async () => {
  const { model } = scripted([]);
  const { route } = routesWith(model);
  const res = await route(
    new Request('http://app/api/assistant', {
      method: 'POST',
      body: JSON.stringify({ text: ' ' })
    }),
    '/api/assistant'
  );
  expect(res!.status).toBe(400);
});

test('forgets a conversation', async () => {
  const { model, asked } = scripted([
    answer([{ type: 'text', text: 'Hei.' }], 'end_turn'),
    answer([{ type: 'text', text: 'Uusi.' }], 'end_turn')
  ]);
  const { route } = routesWith(model);
  const first = await ask(route, { text: 'Hei' });
  const id = (first[0] as { id: string }).id;
  const res = await route(
    new Request(`http://app/api/assistant/${id}`, { method: 'DELETE' }),
    `/api/assistant/${id}`
  );
  expect(res!.status).toBe(204);
  const again = await ask(route, { conversation: id, text: 'Uusi' });
  expect((again[0] as { id: string }).id).not.toBe(id);
  expect(asked[1]!.messages).toHaveLength(1);
});
