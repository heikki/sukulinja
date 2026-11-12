// A person's name as the app writes it: GEDCOM's form, the form it reads
// as, and what a typed one can't be.

import type { PersonName, Sex } from '@/common/types';

const SEXES = new Set<Sex>(['M', 'F', 'X', 'U']);

// A name as GEDCOM writes it, the surname between slashes: "Matti
// /Virtanen/", "Matti //", "/Virtanen/".
export function gedcomName(given: string, surname: string) {
  return `${given} /${surname}/`.trim();
}

// A name as it reads, without GEDCOM's slashes.
export function plainName(fullText: string) {
  return fullText.replaceAll('/', ' ').replaceAll(/\s+/g, ' ').trim();
}

// Why a typed name and sex can't be stored; null when they can.
export function refusedName(name: PersonName) {
  if (name.given.trim() === '' && name.surname.trim() === '') {
    return { rejected: 'Write a name.' };
  }
  if (name.given.includes('/') || name.surname.includes('/')) {
    return { rejected: "A name can't have a slash in it." };
  }
  return SEXES.has(name.sex) ? null : { rejected: 'Say their sex.' };
}
