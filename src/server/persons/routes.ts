// The route adding someone's relative. It reads the request; the handler
// answers it.

import type { NewRelative, Relation, Sex } from '@/common/types';

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

// `{ relation, given, surname, sex, familyId }`; null when it isn't that.
function readRelative(body: unknown): NewRelative | null {
  if (typeof body !== 'object' || body === null) return null;
  const { relation, given, surname, sex, familyId } = body as Record<
    string,
    unknown
  >;
  if (typeof relation !== 'string' || !RELATIONS.has(relation)) return null;
  if (typeof given !== 'string' || typeof surname !== 'string') return null;
  if (typeof sex !== 'string') return null;
  if (familyId !== null && !Number.isInteger(familyId)) return null;
  return {
    relation: relation as Relation,
    given,
    surname,
    sex: sex as Sex,
    familyId: familyId as number | null
  };
}

const RELATIVES_RE = /^\/api\/persons\/(?<person>\d+)\/relatives$/;

// POST /api/persons/:id/relatives adds a new person as their relative.
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
    ? new Response('expected { relation, given, surname, sex, familyId }', {
        status: 400
      })
    : handlers.handleAddRelative(Number(m.groups!.person), relative);
}
