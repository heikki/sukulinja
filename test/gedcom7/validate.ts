// Checks a gedcom.ged against GEDCOM 7's rules with js-gedcom, the spec
// editor's validator, and the registry's g7validation.json at a pinned
// commit. The registry publishes no license, so the rules aren't kept in the
// repo: they're fetched once into .cache/.

import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { G7Lookups } from 'js-gedcom/g7lookups.js';
import { G7Dataset } from 'js-gedcom/g7structure.js';
import { g7ConfGEDC, GEDCStruct } from 'js-gedcom/gedcstruct.js';

const RULES_COMMIT = '19ce01e02c97a1a5af7a09b8e82658c1c315b383';
const RULES_URL = `https://raw.githubusercontent.com/FamilySearch/GEDCOM-registries/${RULES_COMMIT}/generated_files/g7validation.json`;
const RULES_CACHE = join(
  import.meta.dir,
  '.cache',
  `g7validation-${RULES_COMMIT.slice(0, 7)}.json`
);

async function rules() {
  if (!existsSync(RULES_CACHE)) {
    const res = await fetch(RULES_URL);
    if (!res.ok) throw new Error(`can't fetch ${RULES_URL}: ${res.status}`);
    await mkdir(dirname(RULES_CACHE), { recursive: true });
    await Bun.write(RULES_CACHE, await res.text());
  }
  return (await Bun.file(RULES_CACHE).json()) as unknown;
}

const validation = await rules();

// The errors js-gedcom finds. Its warnings are left out: it warns on every
// FilePath and URI payload, which it doesn't check.
export function gedcom7Errors(text: string) {
  const errors: string[] = [];
  const lookups = new G7Lookups(validation);
  lookups.err = (msg) => {
    // js-gedcom takes every run of spaces after a tag as its delimiter, so
    // a value that starts with a space (MyHeritage's `NAME  /Doe/`, no given
    // name) reads as a double delimiter. GEDCOM 7's grammar allows it.
    if (/^\d+: invalid delimiter "  +"$/.test(msg)) return;
    errors.push(msg);
  };
  lookups.warn = () => undefined;
  const gedc = GEDCStruct.fromString(text, g7ConfGEDC, lookups.err);
  if (errors.length === 0) G7Dataset.fromGEDC(gedc, lookups);
  return errors;
}
