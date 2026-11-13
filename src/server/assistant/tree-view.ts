// The dataset as the assistant's read operations see it: everyone, by id,
// with who may be living left out (ADR-0025), except
// the person on screen, whom the question is about.

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

// What's on screen when the question is asked.
export interface OnScreen {
  personId: number | null;
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

  // Whether the person is left out: they may be living and aren't on
  // screen.
  function hidden(id: number) {
    const p = persons.get(id);
    if (p === undefined) return true;
    return id !== onScreen.personId && mayBeLiving(p, thisYear);
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

  return {
    services,
    onScreen,
    persons,
    families,
    hidden,
    ref
  };
}

export type TreeView = ReturnType<typeof openTreeView>;
