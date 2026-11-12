// The routes changing a person and putting their relatives in place. It reads the request; the handler
// answers it.

import type { MoveTarget } from '@/common/tree-cut';
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
  handleUnlink: (personId: number, familyId: number) => Response;
  handleDeletePerson: (personId: number) => Response;
  handleMove: (personId: number, from: number, to: MoveTarget) => Response;
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

// `{ to: { familyId } | { personId } }`; null when it isn't that.
function readMove(body: unknown): MoveTarget | null {
  if (typeof body !== 'object' || body === null) return null;
  const { to } = body as Record<string, unknown>;
  if (typeof to !== 'object' || to === null) return null;
  const { familyId, personId } = to as Record<string, unknown>;
  if (Number.isInteger(familyId)) return { familyId: familyId as number };
  if (Number.isInteger(personId)) return { personId: personId as number };
  return null;
}

// A family of theirs: DELETE takes them out of it; POST …/move moves them
// from it to `to`.
async function routeFamily(
  req: Request,
  handlers: PersonHandlers,
  personId: number,
  m: { family: number; move: boolean }
) {
  if (!m.move) {
    return req.method === 'DELETE'
      ? handlers.handleUnlink(personId, m.family)
      : notAllowed();
  }
  if (req.method !== 'POST') return notAllowed();
  const to = readMove(await req.json().catch(() => null));
  return to === null
    ? new Response('expected { to: { familyId } | { personId } }', {
        status: 400
      })
    : handlers.handleMove(personId, m.family, to);
}

const PERSON_RE =
  /^\/api\/persons\/(?<person>\d+)(?:(?<relatives>\/relatives)|\/families\/(?<family>\d+)(?<move>\/move)?)?$/;

function notAllowed() {
  return new Response('method not allowed', { status: 405 });
}

// PATCH /api/persons/:id changes their name and sex, DELETE deletes them;
// POST
// /api/persons/:id/relatives puts a relative of theirs in place: a new
// person, or someone already in the tree; DELETE
// /api/persons/:id/families/:familyId takes them out of the family, and
// POST …/move moves them from it to another. Null
// for any other path, and for reading a person, which is the tree's.
// The person themself: DELETE deletes them, PATCH changes their name.
async function routePerson(
  req: Request,
  handlers: PersonHandlers,
  personId: number
) {
  if (req.method === 'DELETE') return handlers.handleDeletePerson(personId);
  if (req.method !== 'PATCH') return notAllowed();
  const name = readName(await req.json().catch(() => null));
  return name === null
    ? new Response('expected { given, surname, sex }', { status: 400 })
    : handlers.handleEditPerson(personId, name);
}

export async function routePersons(
  req: Request,
  handlers: PersonHandlers,
  rest: string
) {
  const m = PERSON_RE.exec(rest);
  if (m === null) return null;
  const personId = Number(m.groups!.person);
  const { family, move, relatives } = m.groups!;
  if (family !== undefined) {
    return await routeFamily(req, handlers, personId, {
      family: Number(family),
      move: move !== undefined
    });
  }
  if (relatives === undefined) {
    return await routePerson(req, handlers, personId);
  }
  if (req.method !== 'POST') return notAllowed();
  const relative = readRelative(await req.json().catch(() => null));
  return relative === null
    ? new Response('expected { relation, who, familyId }', { status: 400 })
    : handlers.handleAddRelative(personId, relative);
}
