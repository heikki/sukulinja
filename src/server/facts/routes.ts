// The routes of a person's Facts: adding one, changing or deleting one of
// theirs or their marriages'. They read the request; the handlers answer
// it.

import type { FactFields, NewFact } from '@/common/types';

export interface FactHandlers {
  handlePlaces: () => Response;
  handleAddFact: (personId: number, fact: NewFact) => Response;
  handleEditFact: (
    personId: number,
    factId: number,
    fields: FactFields
  ) => Response;
  handleDeleteFact: (personId: number, factId: number) => Response;
}

async function bodyOf(req: Request) {
  const body = (await req.json().catch(() => null)) as unknown;
  return typeof body === 'object' && body !== null
    ? (body as Record<string, unknown>)
    : {};
}

// `{ date, place, value, type }`, each a string; null for anything else.
function readFields(body: Record<string, unknown>): FactFields | null {
  const { date, place, value, type } = body;
  if (typeof date !== 'string' || typeof place !== 'string') return null;
  if (typeof value !== 'string' || typeof type !== 'string') return null;
  return { date, place, value, type };
}

// The fields, a `tag`, and `familyId` a number or null.
function readNew(body: Record<string, unknown>): NewFact | null {
  const fields = readFields(body);
  const { tag, familyId } = body;
  if (fields === null || typeof tag !== 'string') return null;
  if (familyId !== null && !Number.isInteger(familyId)) return null;
  return { ...fields, tag, familyId: familyId as number | null };
}

const FACTS_RE = /^\/api\/persons\/(?<person>\d+)\/facts(?:\/(?<fact>\d+))?$/;

// GET /api/places lists the places Facts name; POST
// /api/persons/:id/facts adds one; PATCH or DELETE
// /api/persons/:id/facts/:factId changes or deletes one. Null for any
// other path.
export async function routeFacts(
  req: Request,
  handlers: FactHandlers,
  rest: string
) {
  if (rest === '/api/places') {
    return req.method === 'GET'
      ? handlers.handlePlaces()
      : new Response('method not allowed', { status: 405 });
  }
  const m = FACTS_RE.exec(rest);
  if (m === null) return null;
  const personId = Number(m.groups!.person);
  const fact = m.groups!.fact;
  if (fact === undefined) {
    if (req.method !== 'POST') {
      return new Response('method not allowed', { status: 405 });
    }
    const added = readNew(await bodyOf(req));
    return added === null
      ? new Response('expected { tag, familyId, date, place, value, type }', {
          status: 400
        })
      : handlers.handleAddFact(personId, added);
  }
  const factId = Number(fact);
  if (req.method === 'DELETE') {
    return handlers.handleDeleteFact(personId, factId);
  }
  if (req.method !== 'PATCH') {
    return new Response('method not allowed', { status: 405 });
  }
  const fields = readFields(await bodyOf(req));
  return fields === null
    ? new Response('expected { date, place, value, type }', { status: 400 })
    : handlers.handleEditFact(personId, factId, fields);
}
