// The parishes whose church books the app finds in Astia, kept per install
// in the data folder (parishes.json) so that every dataset uses them. A
// parish has no name of its own: it is its Astia archive ("… seurakunnan
// arkisto"), shown by the archive's title, and the spellings of the parish
// that references give, each of which links into it.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface Parish {
  archiveId: string;
  spellings: string[];
}

// What a data folder holds before it has a parishes.json of its own: the
// parishes looked up by hand before the app could find them. FamilySearch's
// "Mikkeli" baptisms predate the town parish (1844) and live in the rural
// parish's books.
export const STARTING_PARISHES: readonly Parish[] = [
  { archiveId: '1200716382', spellings: ['Antrea'] },
  { archiveId: '1194659536', spellings: ['Hankasalmi'] },
  { archiveId: '1202439501', spellings: ['Haukivuori'] },
  { archiveId: '1203505721', spellings: ['Hirvensalmi'] },
  { archiveId: '1212061565', spellings: ['Joroinen'] },
  { archiveId: '1212295491', spellings: ['Juva'] },
  { archiveId: '1212989643', spellings: ['Kangasniemi'] },
  { archiveId: '1852428855', spellings: ['Kirvu'] },
  { archiveId: '1853665727', spellings: ['Kivennapa'] },
  {
    archiveId: '1854401336',
    spellings: ['Mikkelin maaseurakunta', 'Mikkeli', 'Mikkeli Maaseurakunta']
  },
  { archiveId: '1856083369', spellings: ['Mäntyharju'] },
  { archiveId: '1225495701', spellings: ['Pieksämäki', 'Pieksamaki'] },
  { archiveId: '1192981148', spellings: ['Rautalampi'] },
  { archiveId: '1231967062', spellings: ['Sääminki'] }
];

export interface Parishes {
  // The archive the spelling links into; null for one not known.
  archiveOf: (spelling: string | null) => string | null;
  // The archives of the spellings given, most given first.
  ranked: (spellings: Array<string | null>) => string[];
  // Every parish's archive, once each, in the order they were added.
  archives: () => string[];
}

// Parishes read with `load` when first asked.
function parishesOver(load: () => Parish[]) {
  let list: Parish[] | null = null;
  let archiveOf = new Map<string, string>();

  function read() {
    if (list === null) {
      list = load();
      archiveOf = new Map(
        list.flatMap((p) => p.spellings.map((s) => [s, p.archiveId]))
      );
    }
    return list;
  }

  const parishes: Parishes = {
    archiveOf(spelling) {
      read();
      return spelling === null ? null : (archiveOf.get(spelling) ?? null);
    },
    ranked(spellings) {
      const cited = new Map<string, number>();
      for (const s of spellings) {
        const archive = parishes.archiveOf(s);
        if (archive !== null) cited.set(archive, (cited.get(archive) ?? 0) + 1);
      }
      return [...cited.keys()].sort((a, b) => cited.get(b)! - cited.get(a)!);
    },
    archives: () => [...new Set(read().map((p) => p.archiveId))]
  };
  return parishes;
}

function copyOf(list: readonly Parish[]) {
  return list.map((p) => ({
    archiveId: p.archiveId,
    spellings: [...p.spellings]
  }));
}

// The data folder's parishes: its parishes.json, or the starting ones
// while it has none. Read once, when first asked.
export function openParishes(folder: string): Parishes {
  const path = join(folder, 'parishes.json');
  function load() {
    try {
      const text = readFileSync(path, 'utf8');
      return (JSON.parse(text) as { parishes: Parish[] }).parishes;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return copyOf(STARTING_PARISHES);
      }
      throw err;
    }
  }
  return parishesOver(load);
}

// Parishes kept in memory only, the starting ones unless given: for tests
// and tools that save nothing.
export function memoryParishes(
  list: readonly Parish[] = STARTING_PARISHES
): Parishes {
  return parishesOver(() => copyOf(list));
}
