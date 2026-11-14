import { expect, test } from 'bun:test';

import { memoryKeyStore } from './key';
import { keyOperations } from './key-operations';
import { withoutEnvironmentKeys } from './testing';

const SIGNAL = new AbortController().signal;

withoutEnvironmentKeys();

test('says no key, keeps one, and removes it, never answering with it', async () => {
  const store = memoryKeyStore();
  const ops = keyOperations(store);
  expect(await ops.assistantKey({}, SIGNAL)).toEqual({ source: null });
  expect(await ops.setAssistantKey({ key: 'sk-test' }, SIGNAL)).toEqual({
    source: 'saved'
  });
  expect(await store.get()).toBe('sk-test');
  expect(await ops.removeAssistantKey({}, SIGNAL)).toEqual({ source: null });
  expect(await store.get()).toBeNull();
});

test("says the environment's credentials are used without a saved key", async () => {
  process.env.ANTHROPIC_API_KEY = 'from-env';
  expect(
    await keyOperations(memoryKeyStore()).assistantKey({}, SIGNAL)
  ).toEqual({ source: 'environment' });
});
