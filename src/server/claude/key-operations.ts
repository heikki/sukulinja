// The assistant's key, outside any dataset (common/operations/app.ts):
// whether it has one, and keeping or removing the one kept in the
// credential store. The key itself is never sent back.

import type { AppOperations } from '@/common/operations';
import type { AssistantKeyStatus } from '@/common/types';

import { Refusal } from '../operations';
import type { Handlers } from '../operations';
import type { KeyStore } from './key';

// The environment's variables that give credentials when none is kept.
export const ENVIRONMENT_KEYS = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'OPENROUTER_API_KEY'
] as const;

// Whether a key is kept, or else whether the environment gives credentials.
export async function keyStatus(store: KeyStore): Promise<AssistantKeyStatus> {
  if ((await store.get()) !== null) return { source: 'saved' };
  const fromEnv = ENVIRONMENT_KEYS.some((n) => process.env[n] !== undefined);
  return { source: fromEnv ? 'environment' : null };
}

export type KeyOperations = Pick<
  AppOperations,
  'assistantKey' | 'setAssistantKey' | 'removeAssistantKey'
>;

// Each answers with the status as it then stands.
export function keyOperations(store: KeyStore): Handlers<KeyOperations> {
  return {
    assistantKey: async () => await keyStatus(store),
    async setAssistantKey({ key }) {
      try {
        await store.set(key);
      } catch {
        throw new Refusal(500, "The system's key store couldn't keep the key.");
      }
      return await keyStatus(store);
    },
    async removeAssistantKey() {
      await store.remove();
      return await keyStatus(store);
    }
  };
}
