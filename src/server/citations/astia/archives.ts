// Which Astia archive holds a parish's church books, and so which Volumes
// a Citation in that parish can be in.

import { AstiaError } from './astia';
import type { Astia } from './astia';

// A parish whose church books Astia holds: its name, and its fonds ("…
// seurakunnan arkisto"), with the other spellings MyHeritage and
// FamilySearch give it.
export interface Parish {
  name: string;
  archiveId: string;
  spellings: string[];
}

// Parish archives are top-level in Astia, so these were looked up once by
// hand. FamilySearch's "Mikkeli" baptisms predate the town parish (1844)
// and live in the rural parish's books.
export const PARISHES: Parish[] = [
  { name: 'Antrea', archiveId: '1200716382', spellings: [] },
  { name: 'Hankasalmi', archiveId: '1194659536', spellings: [] },
  { name: 'Haukivuori', archiveId: '1202439501', spellings: [] },
  { name: 'Hirvensalmi', archiveId: '1203505721', spellings: [] },
  { name: 'Joroinen', archiveId: '1212061565', spellings: [] },
  { name: 'Juva', archiveId: '1212295491', spellings: [] },
  { name: 'Kangasniemi', archiveId: '1212989643', spellings: [] },
  { name: 'Kirvu', archiveId: '1852428855', spellings: [] },
  { name: 'Kivennapa', archiveId: '1853665727', spellings: [] },
  {
    name: 'Mikkelin maaseurakunta',
    archiveId: '1854401336',
    spellings: ['Mikkeli', 'Mikkeli Maaseurakunta']
  },
  { name: 'Mäntyharju', archiveId: '1856083369', spellings: [] },
  { name: 'Pieksämäki', archiveId: '1225495701', spellings: ['Pieksamaki'] },
  { name: 'Rautalampi', archiveId: '1192981148', spellings: [] },
  { name: 'Sääminki', archiveId: '1231967062', spellings: [] }
];

const ARCHIVE_OF = new Map(
  PARISHES.flatMap((p) =>
    [p.name, ...p.spellings].map((spelling) => [spelling, p.archiveId])
  )
);

// The Astia fonds of the parish, however it's spelled; null for one not
// looked up.
export function parishArchive(parish: string | null) {
  return parish === null ? null : (ARCHIVE_OF.get(parish) ?? null);
}

// The parish's Volumes of every series, for checking a Mark and choosing
// another Volume.
export async function parishVolumes(astia: Astia, parish: string | null) {
  const archiveId = parishArchive(parish);
  return archiveId === null ? [] : await astia.archiveVolumes(archiveId);
}

// The parishes' archives, most cited first.
export function rankedArchives(parishes: Array<string | null>) {
  const cited = new Map<string, number>();
  for (const p of parishes) {
    const archive = parishArchive(p);
    if (archive !== null) cited.set(archive, (cited.get(archive) ?? 0) + 1);
  }
  return [...cited.keys()].sort((a, b) => cited.get(b)! - cited.get(a)!);
}

// Every parish archive looked up, once each.
export function knownArchives() {
  return [...new Set(PARISHES.map((p) => p.archiveId))];
}

// The archive holding the Volume, looked for among `archives` in order; an
// archive already crawled costs no request. Null when none holds it; an
// archive that can't be read is passed over, and throws only if the
// Volume isn't found elsewhere.
export async function archiveAmong(
  astia: Astia,
  volumeId: string,
  archives: string[]
) {
  let failed: AstiaError | null = null;
  for (const archive of archives) {
    try {
      // eslint-disable-next-line no-await-in-loop -- stop at the first holding it
      const volumes = await astia.archiveVolumes(archive);
      if (volumes.some((v) => v.id === volumeId)) return archive;
    } catch (err) {
      if (!(err instanceof AstiaError)) throw err;
      failed = err;
    }
  }
  if (failed !== null) throw failed;
  return null;
}

// The parish archive holding the Volume, looked for among the archives
// of the parishes given, most cited first, as archiveAmong does.
export async function archiveOf(
  astia: Astia,
  volumeId: string,
  parishes: Array<string | null>
) {
  return await archiveAmong(astia, volumeId, rankedArchives(parishes));
}
