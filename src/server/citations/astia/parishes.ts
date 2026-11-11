// The parishes whose church books the app finds in Astia, kept per install
// in the data folder (parishes.json) so that every dataset uses them. A
// parish has no name of its own: it is its Astia archive ("… seurakunnan
// arkisto"), shown by the archive's title, and the spellings of the parish
// that references give, each of which links into it.

import { readFileSync } from 'node:fs';
import { mkdir, rename } from 'node:fs/promises';
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
  // Every parish, in the order they were added.
  all: () => Parish[];
  // The spelling links into the archive from now on, and into no other;
  // a parish is made for an archive not among them.
  link: (spelling: string, archiveId: string) => Promise<void>;
  // The archive joins the parishes, with no spelling yet, unless it's
  // among them.
  add: (archiveId: string) => Promise<void>;
  // Changes whenever a spelling's archive or the archives may have.
  stamp: () => number;
}

// Parishes read with `load` when first asked, each change saved whole
// with `save`, one after another.
function parishesOver(
  load: () => Parish[],
  save: (list: Parish[]) => Promise<void>
) {
  let list: Parish[] | null = null;
  let archiveOf = new Map<string, string>();
  let version = 0;
  let saving: Promise<void> = Promise.resolve();

  function index(of: Parish[]) {
    list = of;
    archiveOf = new Map(
      of.flatMap((p) => p.spellings.map((s) => [s, p.archiveId]))
    );
  }

  function read() {
    if (list === null) index(load());
    return list!;
  }

  // Applies the change to the list, and saves it.
  async function change(next: Parish[]) {
    index(next);
    version += 1;
    const saved = copyOf(next);
    saving = saving
      .catch(() => undefined)
      .then(async () => {
        await save(saved);
      });
    await saving;
  }

  function withArchive(of: Parish[], archiveId: string) {
    return of.some((p) => p.archiveId === archiveId)
      ? of
      : [...of, { archiveId, spellings: [] }];
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
    archives: () => [...new Set(read().map((p) => p.archiveId))],
    all: () => copyOf(read()),
    async link(spelling, archiveId) {
      const next = withArchive(read(), archiveId).map((p) => {
        const others = p.spellings.filter((s) => s !== spelling);
        return {
          archiveId: p.archiveId,
          spellings: p.archiveId === archiveId ? [...others, spelling] : others
        };
      });
      await change(next);
    },
    async add(archiveId) {
      const now = read();
      const next = withArchive(now, archiveId);
      if (next !== now) await change(next);
    },
    stamp: () => version
  };
  return parishes;
}

function copyOf(list: readonly Parish[]) {
  return list.map((p) => ({
    archiveId: p.archiveId,
    spellings: [...p.spellings]
  }));
}

// Written whole under another name, then renamed over the file, so a
// reader never sees half of it.
async function writeJson(folder: string, path: string, value: unknown) {
  await mkdir(folder, { recursive: true });
  const part = `${path}.part`;
  await Bun.write(part, `${JSON.stringify(value, null, 2)}\n`);
  await rename(part, path);
}

// The data folder's parishes: its parishes.json, or the starting ones
// until the first change writes it. Read once, when first asked; only the
// app changes them.
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
  return parishesOver(load, async (parishes) => {
    await writeJson(folder, path, { parishes });
  });
}

// Parishes kept in memory only, the starting ones unless given: for tests
// and tools that save nothing.
export function memoryParishes(
  list: readonly Parish[] = STARTING_PARISHES
): Parishes {
  return parishesOver(
    () => copyOf(list),
    async () => {
      // Kept in memory only.
    }
  );
}
