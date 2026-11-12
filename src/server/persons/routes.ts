// The route putting someone's relative in place. It reads the request; the handler
// answers it.

import type { NewRelative, Relation, RelativeWho, Sex } from '@/common/types';

export interface PersonHandlers {
  handleAddRelative: (personId: number, relative: NewRelative) => Response;
}

const RELATIONS = new Set<string>([
  'father',
  'mother',
  'spouse',
  'child',
  'sibling'
]);

// `{ given, surname, sex }` or `{ personId }`; null when it isn't either.
function readWho(who: unknown): RelativeWho | null {
  if (typeof who !== 'object' || who === null) return null;
  const { personId, given, surname, sex } = who as Record<string, unknown>;
  if (Number.isInteger(personId)) return { personId: personId as number };
  if (typeof given !== 'string' || typeof surname !== 'string') return null;
  // An unknown sex is the server's to refuse, in words.
  if (typeof sex !== 'string') return null;
  return { given, surname, sex: sex as Sex };
}

// `{ relation, who, familyId }`; null when it isn't that.
function readRelative(body: unknown): NewRelative | null {
  if (typeof body !== 'object' || body === null) return null;
  const { relation, who, familyId } = body as Record<string, unknown>;
  if (typeof relation !== 'string' || !RELATIONS.has(relation)) return null;
  const read = readWho(who);
  if (read === null) return null;
  if (familyId !== null && !Number.isInteger(familyId)) return null;
  return {
    relation: relation as Relation,
    who: read,
    familyId: familyId as number | null
  };
}

const RELATIVES_RE = /^\/api\/persons\/(?<person>\d+)\/relatives$/;

// POST /api/persons/:id/relatives puts a relative of theirs in place: a
// new person, or someone already in the tree.
// Null for any other path.
export async function routePersons(
  req: Request,
  handlers: PersonHandlers,
  rest: string
) {
  const m = RELATIVES_RE.exec(rest);
  if (m === null) return null;
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }
  const relative = readRelative(await req.json().catch(() => null));
  return relative === null
    ? new Response('expected { relation, who, familyId }', {
        status: 400
      })
    : handlers.handleAddRelative(Number(m.groups!.person), relative);
}
