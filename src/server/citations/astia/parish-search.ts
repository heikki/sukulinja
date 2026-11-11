// Finding a parish's archive in Astia by what a reference calls the
// parish ("Puumala", "Pieksamaki"), or by what's typed. Astia lists its
// archives by first letter; a parish's is "… seurakunnan arkisto", titled
// in the genitive ("Pieksämäen"), so a title matches by how much of its
// start it shares with the name, however the name spells ä and ö.

import type { Astia } from './astia';

// An archive found, by its id and its title as Astia gives it.
export interface FoundArchive {
  archiveId: string;
  title: string;
}

// The letters Astia lists archives under.
const LETTERS = [
  ...['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm'],
  ...['n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z'],
  ...['å', 'ä', 'ö', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9']
];

// A name shares at least this much of its start with a title found by it,
// or all of itself when shorter: "Pieksämäki" and "Pieksämäen" share 7.
const MIN_SHARED = 4;

// Most found are a handful; a letter or two typed would list hundreds.
const MAX_FOUND = 30;

const PARISH_ARCHIVE = /seurakunnan arkisto/iu;

// Whether the archive's title is a parish's.
export function isParishArchive(title: string) {
  return PARISH_ARCHIVE.test(title);
}

// Lower case, without the marks on ä, ö and å.
function fold(text: string) {
  return text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}

function shared(a: string, b: string) {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n += 1;
  return n;
}

// "Puumalan seurakunnan arkisto ( Puumalan seurakunta )" without who
// formed it, as the archive's own title reads.
function withoutCreator(title: string) {
  return title.replace(/\s*\(.*\)\s*$/u, '');
}

function byScoreThenTitle(
  a: { score: number; title: string },
  b: { score: number; title: string }
) {
  return b.score === a.score
    ? a.title.localeCompare(b.title, 'fi')
    : b.score - a.score;
}

// The parish archives whose titles start most like `name`, best first.
export async function findParishArchives(
  astia: Astia,
  name: string
): Promise<FoundArchive[]> {
  const wanted = fold(name.trim());
  const first = wanted[0];
  if (first === undefined) return [];
  const letters = LETTERS.filter((l) => fold(l) === first);
  const listed = (
    await Promise.all(letters.map(async (l) => await astia.archivesByLetter(l)))
  ).flat();
  const least = Math.min(wanted.length, MIN_SHARED);
  return listed
    .filter((a) => isParishArchive(a.title))
    .map((a) => {
      const title = withoutCreator(a.title);
      return { archiveId: a.id, title, score: shared(wanted, fold(title)) };
    })
    .filter((a) => a.score >= least)
    .sort(byScoreThenTitle)
    .slice(0, MAX_FOUND)
    .map(({ archiveId, title }) => ({ archiveId, title }));
}
