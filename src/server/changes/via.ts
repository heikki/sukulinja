// How a Change came to be made: by hand (none), or through the assistant,
// by a Proposal applied (ADR-0025). Applying runs the app's own operations
// within `madeVia`, and every Change written while one of them runs, on
// any of the paths that write one, says so. Edits made by hand at the same
// time run outside it and don't.

import { AsyncLocalStorage } from 'node:async_hooks';

import type { ChangeVia } from '@/common/types';

const current = new AsyncLocalStorage<ChangeVia>();

// Runs `run`, its Changes made via `via`.
export async function madeVia<T>(
  via: ChangeVia,
  run: () => Promise<T> | T
): Promise<T> {
  return await current.run(via, async () => await run());
}

// How the Change being written is made; null by hand.
export function viaNow(): ChangeVia | null {
  return current.getStore() ?? null;
}
