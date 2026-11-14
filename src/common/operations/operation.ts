// A dataset operation, defined once for both sides of the seam: its name
// is its route (POST /d/<slug>/api/<name>), `read` takes its request
// apart, and its answer's type rides along. The client's HTTP adapter
// (client/dataset-api) asks by it; the server's operations
// (server/operations.ts) answer by it. Every request is a JSON object;
// one taking nothing sends `{}`.

// What a request's body must be: its input, or null for anything else,
// which the server answers 400 with `expects`.
type Reader<In> = (body: Record<string, unknown>) => In | null;

// Answered as one JSON value ('json'; none answers 204), or as NDJSON,
// one Out a line, as it's found ('lines').
export type AnswerKind = 'json' | 'lines';

export interface Operation<In, Out, Kind extends AnswerKind = AnswerKind> {
  answer: Kind;
  // The body expected, for the person reading why a request was refused.
  expects: string;
  read: Reader<In>;
  // Only the type: what it answers (each line, for 'lines').
  out?: Out;
}

// Answers one JSON value, or none for `void`.
export function answers<In, Out>(
  expects: string,
  read: Reader<In>
): Operation<In, Out, 'json'> {
  return { answer: 'json', expects, read };
}

// Answers a line at a time, as it's found.
export function streams<In, Line>(
  expects: string,
  read: Reader<In>
): Operation<In, Line, 'lines'> {
  return { answer: 'lines', expects, read };
}

// One taking nothing.
export function asksNothing<Out>(): Operation<Nothing, Out, 'json'> {
  return answers('{}', () => ({}));
}

export type Nothing = Record<string, never>;

// Any operation, as tables hold them.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- only read through InputOf and OutputOf
export type AnyOperation = Operation<any, any>;

export type InputOf<O> = O extends { read: (body: never) => infer In }
  ? Exclude<In, null>
  : never;
export type OutputOf<O> = O extends { out?: infer Out } ? Out : never;
