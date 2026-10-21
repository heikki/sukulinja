// Reading a GEDZIP (FamilySearch GEDCOM 7.0, chapter 4): one zip holding the
// dataset as `gedcom.ged` and every local file it names, each entry at the path
// its FILE gives. Unpacked into a folder, the media resolve against that folder
// as they would beside a `.ged`.

import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { unzipSync } from 'fflate';

const GEDCOM_ENTRY = 'gedcom.ged';

export class GedzipError extends Error {}

// An entry can be written under the folder only if its name can't climb out
// of it: names in an archive are untrusted.
function isSafe(name: string) {
  return (
    name !== '' && !name.startsWith('/') && !name.split('/').includes('..')
  );
}

// Folders, the dataset itself, and the `__MACOSX/` copies Finder's Compress
// adds aren't media.
function isMedia(name: string) {
  return (
    name !== GEDCOM_ENTRY &&
    !name.endsWith('/') &&
    !name.startsWith('__MACOSX/')
  );
}

function entryNames(zip: Uint8Array) {
  const names: string[] = [];
  try {
    unzipSync(zip, {
      filter: (f) => {
        names.push(f.name);
        return false;
      }
    });
  } catch {
    throw new GedzipError('not a zip archive');
  }
  return names;
}

// One entry at a time, so a large archive isn't inflated into memory whole.
function entry(zip: Uint8Array, name: string) {
  const bytes = unzipSync(zip, { filter: (f) => f.name === name })[name];
  if (bytes === undefined) throw new GedzipError(`can't read ${name}`);
  return bytes;
}

// Writes the archive's media under `dir`, and returns its GEDCOM's text and
// the media written, by entry name. An entry named to escape `dir` isn't
// written, so a FILE naming it is missing.
export async function unpackGedzip(zip: Uint8Array, dir: string) {
  const names = entryNames(zip);
  if (!names.includes(GEDCOM_ENTRY)) {
    throw new GedzipError(`no ${GEDCOM_ENTRY} at the top of the archive`);
  }
  const text = new TextDecoder().decode(entry(zip, GEDCOM_ENTRY));
  const files = names.filter((n) => isMedia(n) && isSafe(n));
  /* eslint-disable no-await-in-loop -- one entry inflated at a time */
  for (const name of files) {
    const dest = join(dir, name);
    await mkdir(dirname(dest), { recursive: true });
    await Bun.write(dest, entry(zip, name));
  }
  /* eslint-enable no-await-in-loop */
  return { text, files };
}
