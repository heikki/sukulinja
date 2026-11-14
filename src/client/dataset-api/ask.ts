// Asking the app over HTTP, shared by its adapters: a request's answer or
// its refusal as an ApiError, and an operation table's calls
// (common/operations).

import { readNdjson } from '@/client/ndjson';
import type { AnyOperation, InputOf, OutputOf } from '@/common/operations';

// A request the app answered with an error, or couldn't be reached for. Its
// words are for the person using the app. Anything else thrown is a bug.
export class ApiError extends Error {
  override name = 'ApiError';
}

export const NOT_RESPONDING = 'The app is not responding.';

export interface FetchOptions {
  // How a request is sent; the global fetch by default.
  fetch?: (req: Request) => Promise<Response>;
  // Prefixed to every URL; none in the app, whose pages share its origin.
  origin?: string;
}

type Send = (req: Request) => Promise<Response>;

// After `signal` aborts, a call rejects with the signal's reason, whatever
// it failed with and even if its answer came, so a caller can tell
// superseded from failed. Checked here as well as by `fetch`, since a
// `fetch` given in tests may not watch the signal.
export async function settled<T>(
  signal: AbortSignal | undefined,
  run: () => T
) {
  try {
    const value = await run();
    signal?.throwIfAborted();
    return value;
  } catch (err) {
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- the abort's own reason
    if (signal?.aborted === true) throw signal.reason;
    throw err;
  }
}

// Sends a request: the answer, if it's not an error. `what` names the
// request when the app gives no words of its own.
export function asker(send: Send) {
  return async function ask(what: string, url: string, init: RequestInit = {}) {
    const req = new Request(url, init);
    const res = await send(req).catch((err: unknown) => {
      throw new ApiError(NOT_RESPONDING, { cause: err });
    });
    if (res.ok) return res;
    const words = await res.text().catch(() => '');
    throw new ApiError(words === '' ? `${what} failed (${res.status})` : words);
  };
}

type Table = Record<string, AnyOperation>;
type Answered<T> = {
  [N in keyof T]: T[N] extends { answer: 'json' } ? N : never;
}[keyof T] &
  string;
type Streamed<T> = Exclude<keyof T, Answered<T>> & string;

// Asks the table's operations at `base` (<base>/<name>): `call` for one
// answering a value, or none; `lines` for one answering line by line.
// `what` names an operation when the app gives no words of its own.
export function operationsAt<T extends Table>(send: Send, base: string) {
  const ask = asker(send);

  async function post(
    name: string,
    input: unknown,
    what: string,
    signal?: AbortSignal
  ) {
    return await ask(what, `${base}/${name}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
      signal
    });
  }

  async function call<N extends Answered<T>>(
    name: N,
    input: InputOf<T[N]>,
    what: string,
    signal?: AbortSignal
  ): Promise<OutputOf<T[N]>> {
    return await settled(signal, async () => {
      const res = await post(name, input, what, signal);
      if (res.status === 204) return undefined as OutputOf<T[N]>;
      return (await res.json()) as OutputOf<T[N]>;
    });
  }

  async function* lines<N extends Streamed<T>>(
    name: N,
    input: InputOf<T[N]>,
    what: string,
    signal?: AbortSignal
  ): AsyncGenerator<OutputOf<T[N]>, void, undefined> {
    const res = await settled(
      signal,
      async () => await post(name, input, what, signal)
    );
    if (res.body === null) throw new ApiError(NOT_RESPONDING);
    try {
      for await (const line of readNdjson(res.body)) {
        signal?.throwIfAborted();
        yield line as OutputOf<T[N]>;
      }
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- the abort's own reason
      if (signal?.aborted === true) throw signal.reason;
      // A line that isn't JSON is a bug; a stream cut off isn't.
      if (err instanceof SyntaxError) throw err;
      throw new ApiError(NOT_RESPONDING, { cause: err });
    }
  }

  return { call, lines };
}
