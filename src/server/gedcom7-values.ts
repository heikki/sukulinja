// Values GEDCOM 7 writes differently from GEDCOM 5.5.1: enumerations with a
// PHRASE for what they can't name, calendars, and languages. The import
// stores them the GEDCOM 7 way, so a dataset reads the same whichever
// version it came from.

import { FAMILY_FACT_TAGS, PERSON_FACT_TAGS } from './gedcom-tags';

// A citation's EVEN names an event or attribute.
export const EVENT_TYPES = new Set([...PERSON_FACT_TAGS, ...FAMILY_FACT_TAGS]);

export const ROLES = new Set([
  'CHIL',
  'CLERGY',
  'FATH',
  'FRIEND',
  'GODP',
  'HUSB',
  'MOTH',
  'MULTIPLE',
  'NGHBR',
  'OFFICIATOR',
  'PARENT',
  'SPOU',
  'WIFE',
  'WITN',
  'OTHER'
]);

export const NAME_TYPES = new Set([
  'AKA',
  'BIRTH',
  'IMMIGRANT',
  'MAIDEN',
  'MARRIED',
  'PROFESSIONAL',
  'OTHER'
]);

// How an enumeration line writes a stored value: as itself when the
// enumeration has it, else as `other` with the value as its PHRASE.
export function enumeration(
  value: string,
  allowed: Set<string>,
  other: string
) {
  return allowed.has(value)
    ? { payload: value, phrase: null }
    : { payload: other, phrase: value };
}

// GEDCOM 5.5.1 escapes name a calendar (`@#DJULIAN@ 1 JAN 1700`); GEDCOM 7
// names it with a word (`JULIAN 1 JAN 1700`).
const CALENDARS: Array<[string, string]> = [
  ['@#DGREGORIAN@', 'GREGORIAN'],
  ['@#DJULIAN@', 'JULIAN'],
  ['@#DHEBREW@', 'HEBREW'],
  ['@#DFRENCH R@', 'FRENCH_R']
];

export function gedcom7Date(date: string | null) {
  if (date === null) return null;
  let out = date;
  for (const [escape, word] of CALENDARS) out = out.replaceAll(escape, word);
  return out;
}

// GEDCOM 5.5.1 names a language in English; GEDCOM 7 gives its BCP 47 tag.
const LANGUAGE_TAGS: Record<string, string> = {
  Czech: 'cs',
  Danish: 'da',
  Dutch: 'nl',
  English: 'en',
  Estonian: 'et',
  Finnish: 'fi',
  French: 'fr',
  German: 'de',
  Hungarian: 'hu',
  Icelandic: 'is',
  Italian: 'it',
  Latin: 'la',
  Latvian: 'lv',
  Lithuanian: 'lt',
  Norwegian: 'no',
  Polish: 'pl',
  Portuguese: 'pt',
  Russian: 'ru',
  Sami: 'se',
  Spanish: 'es',
  Swedish: 'sv'
};

export function languageTag(language: string) {
  return LANGUAGE_TAGS[language] ?? language;
}

// GEDCOM rates a citation 0–3. MyHeritage writes 4 for its best, which is
// taken as GEDCOM's best (ADR-0013).
export function gedcom7Quality(quality: number | null) {
  if (quality === null) return null;
  return Math.min(Math.max(quality, 0), 3);
}

// An age with no unit, as MyHeritage writes one (`48`), is in years.
export function gedcom7Age(age: string | null) {
  if (age === null) return null;
  return /^\d+$/.test(age.trim()) ? `${age.trim()}y` : age;
}
