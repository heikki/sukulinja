// The routes of a dataset's Reminders: listing them, writing one, changing
// or deleting one. They read the request; the handlers answer it.

import type { ReminderChange, ReminderTarget } from '@/common/types';

export interface ReminderHandlers {
  handleReminders: () => Promise<Response>;
  handleRemind: (text: string, target: ReminderTarget) => Promise<Response>;
  handleChangeReminder: (
    id: number,
    change: ReminderChange
  ) => Promise<Response>;
  handleDeleteReminder: (id: number) => Response;
}

async function bodyOf(req: Request) {
  const body = (await req.json().catch(() => null)) as unknown;
  return typeof body === 'object' && body !== null
    ? (body as Record<string, unknown>)
    : {};
}

function isId(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

// `{ personId }`, `{ citationId }` or `{ volumeId, volume, image, fileId }`.
// Anything else is null.
function readTarget(on: unknown) {
  if (typeof on !== 'object' || on === null) return null;
  const { personId, citationId } = on as Record<string, unknown>;
  if (isId(personId)) return { personId };
  if (isId(citationId)) return { citationId };
  return readImage(on as Record<string, unknown>);
}

function readImage(on: Record<string, unknown>) {
  const { volumeId, volume, image, fileId } = on;
  if (typeof volumeId !== 'string' || volumeId === '') return null;
  if (typeof volume !== 'string' || typeof fileId !== 'string') return null;
  if (!isId(image) || fileId === '') return null;
  return { volumeId, volume, image, fileId };
}

// `{ text, on }`. Anything else is rejected.
async function routeRemind(req: Request, handlers: ReminderHandlers) {
  const { text, on } = await bodyOf(req);
  const target = readTarget(on);
  return typeof text !== 'string' || target === null
    ? new Response('expected { text, on }', { status: 400 })
    : await handlers.handleRemind(text, target);
}

// `{ text?, done? }`. Anything else is rejected.
async function routeChange(
  req: Request,
  handlers: ReminderHandlers,
  id: number
) {
  const { text, done } = await bodyOf(req);
  const change: ReminderChange = {};
  if (typeof text === 'string') change.text = text;
  if (typeof done === 'boolean') change.done = done;
  const bad =
    (text !== undefined && change.text === undefined) ||
    (done !== undefined && change.done === undefined);
  return bad
    ? new Response('expected { text?, done? }', { status: 400 })
    : await handlers.handleChangeReminder(id, change);
}

// GET /api/reminders lists them and POST writes one; PATCH or DELETE
// /api/reminders/:id changes or deletes one. Null for any other path.
export async function routeReminders(
  req: Request,
  handlers: ReminderHandlers,
  rest: string
) {
  if (rest === '/api/reminders') {
    if (req.method === 'GET') return await handlers.handleReminders();
    if (req.method === 'POST') return await routeRemind(req, handlers);
    return new Response('method not allowed', { status: 405 });
  }
  const one = /^\/api\/reminders\/(?<id>\d+)$/.exec(rest);
  if (one === null) return null;
  const id = Number(one.groups!.id);
  if (req.method === 'PATCH') return await routeChange(req, handlers, id);
  if (req.method === 'DELETE') return handlers.handleDeleteReminder(id);
  return new Response('method not allowed', { status: 405 });
}
