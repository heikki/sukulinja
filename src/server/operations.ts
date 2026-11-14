// Answering a dataset's operations (common/operations): POST
// /d/<slug>/api/<name> with the operation's JSON body. The body is read
// here, by the operation's own `read`, so a handler is given its input
// only as the operation defines it, and answers with its output or throws
// a Refusal.

import { OPERATIONS } from '@/common/operations';
import type {
  AnyOperation,
  InputOf,
  OperationName,
  Operations,
  OutputOf
} from '@/common/operations';

// Why a request wasn't done, in words for the person using the app: 400
// for one its rules refuse, 404 for what isn't there, 409 for a
// conflict, 502 for Astia failing.
export class Refusal extends Error {
  override name = 'Refusal';
  constructor(
    readonly status: 400 | 404 | 409 | 502,
    words: string
  ) {
    super(words);
  }
}

// What isn't there: `${what} not found`.
export function notFound(what: string) {
  return new Refusal(404, `${what} not found`);
}

// What a module answers: its value, `{ rejected }` for one its rules
// refuse, or null for what isn't there. The value, or a Refusal thrown.
export function answered<T>(
  result: T | { rejected: string } | null,
  missing: string
): T {
  if (result === null) throw notFound(missing);
  if (typeof result === 'object' && 'rejected' in result) {
    throw new Refusal(400, result.rejected);
  }
  return result;
}

// A streamed operation's lines; it may refuse before the first.
type Answer<O> = O extends { answer: 'lines' }
  ? AsyncIterable<OutputOf<O>> | Promise<AsyncIterable<OutputOf<O>>>
  : OutputOf<O> | Promise<OutputOf<O>>;

// Answers an operation's input; `signal` aborts when its client goes.
export type Handler<O> = (input: InputOf<O>, signal: AbortSignal) => Answer<O>;

export type Handlers<Table> = { [K in keyof Table]: Handler<Table[K]> };

const ROUTE_RE = /^\/api\/(?<name>[A-Za-z]+)$/u;

function isOperation(name: string): name is OperationName {
  return Object.hasOwn(OPERATIONS, name);
}

async function bodyOf(req: Request) {
  const body = (await req.json().catch(() => null)) as unknown;
  return typeof body === 'object' && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

function refused(err: unknown) {
  // eslint-disable-next-line @typescript-eslint/only-throw-error -- rethrown as caught
  if (!(err instanceof Refusal)) throw err;
  return new Response(err.message, { status: err.status });
}

// One JSON value a line, as each is found. A stream cancelled lets the
// one under way finish, unread.
function linesOf(lines: AsyncIterable<unknown>) {
  const it = lines[Symbol.asyncIterator]();
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = await it.next();
      if (next.done === true) controller.close();
      else controller.enqueue(enc.encode(`${JSON.stringify(next.value)}\n`));
    },
    async cancel() {
      await it.return?.();
    }
  });
  return new Response(stream, {
    headers: { 'content-type': 'application/x-ndjson' }
  });
}

// The operation's input, as its `read` takes the body apart; null for
// a body it isn't.
async function inputOf(op: AnyOperation, req: Request): Promise<unknown> {
  const body = await bodyOf(req);
  return body === null ? null : op.read(body);
}

// What the handler answered, as the operation answers it.
async function answerOf(op: AnyOperation, out: unknown) {
  if (op.answer === 'lines') {
    return linesOf((await out) as AsyncIterable<unknown>);
  }
  const value: unknown = await out;
  return value === undefined
    ? new Response(null, { status: 204 })
    : Response.json(value);
}

// Answers the operation a request names, by the handler for it; null for
// a path that names none. Every operation has one, as the type says.
export function serveOperations(handlers: Handlers<Operations>) {
  return async (req: Request, rest: string): Promise<Response | null> => {
    const name = ROUTE_RE.exec(rest)?.groups?.name;
    if (name === undefined || !isOperation(name)) return null;
    if (req.method !== 'POST') {
      return new Response('method not allowed', { status: 405 });
    }
    const op: AnyOperation = OPERATIONS[name];
    const input = await inputOf(op, req);
    if (input === null) {
      return new Response(`expected ${op.expects}`, { status: 400 });
    }
    const handler = handlers[name] as (
      input: unknown,
      signal: AbortSignal
    ) => unknown;
    try {
      return await answerOf(op, handler(input, req.signal));
    } catch (err) {
      return refused(err);
    }
  };
}
