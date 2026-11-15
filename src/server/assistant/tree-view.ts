// The dataset as the assistant's read operations see it: everyone, by id,
// with who may be living left out (ADR-0025), except
// the person on screen, whom the question is about, unless the person
// chose in Settings to include the living.

import type { PersonRow } from '@/common/types';

import type { DatasetServices } from '../datasets/services';
import { mayBeLiving } from './living';

// A person as the assistant names them.
export interface PersonRef {
  id: number;
  name: string;
  born: number | null;
  died: number | null;
}

// What's on screen when the question is asked, and whether the living
// are to be included.
export interface OnScreen {
  personId: number | null;
  living?: boolean;
}

// Where someone left out stood.
export const LEFT_OUT = 'someone who may be living (left out)';

export function nameOf(p: Pick<PersonRow, 'given' | 'surname'>) {
  const name = [p.given, p.surname].filter((s) => s !== null).join(' ');
  return name === '' ? '(no name)' : name;
}

export function openTreeView(
  services: DatasetServices,
  onScreen: OnScreen,
  thisYear = new Date().getFullYear()
) {
  const persons = new Map(services.tree.persons().map((p) => [p.id, p]));
  const families = services.tree.families();

  // Whether the person is left out: they may be living, aren't on
  // screen, and the living aren't included.
  function hidden(id: number) {
    const p = persons.get(id);
    if (p === undefined) return true;
    if (onScreen.living === true || id === onScreen.personId) return false;
    return mayBeLiving(p, thisYear);
  }

  function ref(id: number): PersonRef | string {
    const p = persons.get(id);
    if (p === undefined || hidden(id)) return LEFT_OUT;
    return {
      id,
      name: nameOf(p),
      born: p.birth_year,
      died: p.death_year
    };
  }

  // Why a change on the person can't be proposed: they aren't in the
  // tree, or they're left out, whom the assistant doesn't write about
  // either; null when it can.
  function unwritable(id: number) {
    if (!persons.has(id)) return 'No such person.';
    return hidden(id) ? `This is ${LEFT_OUT}.` : null;
  }

  // The person's name, for the person using the app.
  function nameOfId(id: number) {
    const p = persons.get(id);
    return p === undefined ? `person ${id}` : nameOf(p);
  }

  return {
    services,
    onScreen,
    persons,
    families,
    hidden,
    ref,
    unwritable,
    nameOf: nameOfId
  };
}

export type TreeView = ReturnType<typeof openTreeView>;
