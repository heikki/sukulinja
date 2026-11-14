// /settings/assistant-key: whether the assistant has a key, and setting or
// removing the one kept in the credential store. The key itself is never
// sent back.

import type { AssistantKeyStatus } from '@/common/types';

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

// GET says where the key comes from, PUT `{ key }` keeps one, DELETE
// removes it; each answers with the status as it now stands. Null for any
// other path.
export async function routeAssistantKey(
  store: KeyStore,
  req: Request,
  pathname: string
) {
  if (pathname !== '/settings/assistant-key') return null;
  if (req.method === 'PUT') {
    const body = (await req.json().catch(() => null)) as {
      key?: unknown;
    } | null;
    const key = typeof body?.key === 'string' ? body.key.trim() : '';
    if (key === '') return new Response('expected { key }', { status: 400 });
    try {
      await store.set(key);
    } catch {
      return new Response("The system's key store couldn't keep the key.", {
        status: 500
      });
    }
  } else if (req.method === 'DELETE') {
    await store.remove();
  } else if (req.method !== 'GET') {
    return new Response('method not allowed', { status: 405 });
  }
  return Response.json(await keyStatus(store));
}
