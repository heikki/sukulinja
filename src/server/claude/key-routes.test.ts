import { afterEach, beforeEach, expect, test } from 'bun:test';

import { memoryKeyStore } from './key';
import { routeAssistantKey } from './key-routes';

const URL = 'http://app/settings/assistant-key';
const NAMES = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'OPENROUTER_API_KEY'
];
const saved = new Map<string, string | undefined>();

beforeEach(() => {
  for (const n of NAMES) {
    saved.set(n, process.env[n]);
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- an unset variable is what's tested
    delete process.env[n];
  }
});

afterEach(() => {
  for (const n of NAMES) {
    const v = saved.get(n);
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- put back as it was
    if (v === undefined) delete process.env[n];
    else process.env[n] = v;
  }
});

async function ask(
  store: ReturnType<typeof memoryKeyStore>,
  init?: RequestInit
) {
  const res = await routeAssistantKey(
    store,
    new Request(URL, init),
    '/settings/assistant-key'
  );
  return res!;
}

test('says no key, keeps one, and removes it, never answering with it', async () => {
  const store = memoryKeyStore();
  expect(await (await ask(store)).json()).toEqual({ source: null });
  const put = await ask(store, {
    method: 'PUT',
    body: JSON.stringify({ key: ' sk-test ' })
  });
  expect(await put.text()).toBe('{"source":"saved"}');
  expect(await store.get()).toBe('sk-test');
  const del = await ask(store, { method: 'DELETE' });
  expect(await del.json()).toEqual({ source: null });
  expect(await store.get()).toBeNull();
});

test("says the environment's credentials are used without a saved key", async () => {
  process.env.ANTHROPIC_API_KEY = 'from-env';
  expect(await (await ask(memoryKeyStore())).json()).toEqual({
    source: 'environment'
  });
});

test('refuses an empty key', async () => {
  const res = await ask(memoryKeyStore(), {
    method: 'PUT',
    body: JSON.stringify({ key: '  ' })
  });
  expect(res.status).toBe(400);
});

test('answers only its own path', async () => {
  const res = await routeAssistantKey(
    memoryKeyStore(),
    new Request('http://app/settings/other'),
    '/settings/other'
  );
  expect(res).toBeNull();
});
