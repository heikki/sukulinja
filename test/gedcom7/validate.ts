// Checks a gedcom.ged against GEDCOM 7's rules with @domorium/validator,
// which carries the specification's schemas, so nothing is fetched.

import { GedcomDocument } from '@domorium/validator';

// The problems the validator finds. A tag GEDCOM 7 doesn't allow where it
// stands is only a warning there (VAL001), but the standard forbids it, so
// it counts; other warnings don't.
export function gedcom7Errors(text: string) {
  return new GedcomDocument()
    .createDocument(text)
    .getErrors()
    .filter((e) => e.level === 'error' || e.code === 'VAL001')
    .map((e) => `${e.code} ${e.message}`);
}
