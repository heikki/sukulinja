// The assistant's Anthropic API key, kept in the system's credential store
// (Bun.secrets: the Keychain on macOS), never in a file. Set and removed
// in Settings.

import { secrets } from 'bun';

const ENTRY = { service: 'Sukulinja', name: 'anthropic-api-key' };

export interface KeyStore {
  get: () => Promise<string | null>;
  set: (key: string) => Promise<void>;
  remove: () => Promise<void>;
}

// The system's credential store. One that can't be reached (no keyring on
// a Linux server) reads as holding no key.
export function systemKeyStore(): KeyStore {
  return {
    async get() {
      try {
        return await secrets.get(ENTRY);
      } catch {
        return null;
      }
    },
    async set(key) {
      await secrets.set({ ...ENTRY, value: key });
    },
    async remove() {
      try {
        await secrets.delete(ENTRY);
      } catch {
        // Nothing kept, or nowhere to keep it: either way no key is left.
      }
    }
  };
}

// A key kept in memory, for tests.
export function memoryKeyStore(initial: string | null = null): KeyStore {
  let key = initial;
  return {
    async get() {
      return await Promise.resolve(key);
    },
    async set(value) {
      key = value;
      await Promise.resolve();
    },
    async remove() {
      key = null;
      await Promise.resolve();
    }
  };
}
