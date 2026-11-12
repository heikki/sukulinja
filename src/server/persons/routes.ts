// The routes changing a person and putting their relatives in place. It reads the request; the handler
// answers it.

import type {
  NewRelative,
  PersonName,
  Relation,
  RelativeWho,
  Sex
} from '@/common/types';

export interface PersonHandlers {
  handleAddRelative: (personId: number, relative: NewRelative) => Response;
  handleEditPerson: (personId: number, name: PersonName) => Response;
}

const RELATIONS = new Set<string>([
  'father',
  'mother',
  'spouse',
  'child',
  'sibling'
]);

// `{ given, surname, sex }`, each a string; null when it isn't that. A sex
// GEDCOM doesn't have is the handler's to refuse, in words.
function readName(body: unknown): PersonName | null {
  if (typeof body !== 'object' || body === null) return null;
  const { given, surname, sex } = body as Record<string, unknown>;
  if (typeof given !== 'string' || typeof surname !== 'string') return null;
  if (typeof sex !== 'string') return null;
  return { given, surname, sex: sex as Sex };
}

// A name as readName reads it, or `{ personId }`; null when it isn't
// either.
function readWho(who: unknown): RelativeWho | null {
  if (typeof who !== 'object' || who === null) return null;
  const { personId } = who as Record<string, unknown>;
  if (Number.isInteger(personId)) return { personId: personId as number };
  return readName(who);
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

const PERSON_RE = /^\/api\/persons\/(?<person>\d+)(?<relatives>\/relatives)?$/;

function notAllowed() {
  return new Response('method not allowed', { status: 405 });
}

// PATCH /api/persons/:id changes their name and sex; POST
// /api/persons/:id/relatives puts a relative of theirs in place: a new
// person, or someone already in the tree. Null for any other path, and
// for reading a person, which is the tree's.
export async function routePersons(
  req: Request,
  handlers: PersonHandlers,
  rest: string
) {
  const m = PERSON_RE.exec(rest);
  if (m === null) return null;
  const personId = Number(m.groups!.person);
  const body = (await req.json().catch(() => null)) as unknown;
  if (m.groups!.relatives === undefined) {
    if (req.method !== 'PATCH') return notAllowed();
    const name = readName(body);
    return name === null
      ? new Response('expected { given, surname, sex }', { status: 400 })
      : handlers.handleEditPerson(personId, name);
  }
  if (req.method !== 'POST') return notAllowed();
  const relative = readRelative(body);
  return relative === null
    ? new Response('expected { relation, who, familyId }', { status: 400 })
    : handlers.handleAddRelative(personId, relative);
}
