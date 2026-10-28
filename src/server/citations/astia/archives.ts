// Which Astia archive holds a parish's church books, and so which Volumes
// a Citation in that parish can be in.

import { AstiaError } from './astia';
import type { Astia } from './astia';

// Astia fonds ("… seurakunnan arkisto") per parish as MyHeritage and
// FamilySearch spell it. Parish archives are top-level in Astia, so these
// were looked up once by hand. FamilySearch's "Mikkeli" baptisms predate
// the town parish (1844) and live in the rural parish's books.
const PARISH_ARCHIVE: Record<string, string> = {
  'Antrea': '1200716382',
  'Hankasalmi': '1194659536',
  'Haukivuori': '1202439501',
  'Hirvensalmi': '1203505721',
  'Joroinen': '1212061565',
  'Juva': '1212295491',
  'Kangasniemi': '1212989643',
  'Kirvu': '1852428855',
  'Kivennapa': '1853665727',
  'Mikkeli': '1854401336',
  'Mikkeli Maaseurakunta': '1854401336',
  'Mäntyharju': '1856083369',
  'Pieksamaki': '1225495701',
  'Pieksämäki': '1225495701',
  'Rautalampi': '1192981148',
  'Sääminki': '1231967062'
};

// The Astia fonds of the parish, however it's spelled; null for one not
// looked up.
export function parishArchive(parish: string | null) {
  return parish === null ? null : (PARISH_ARCHIVE[parish] ?? null);
}

// The parish's Volumes of every series, for checking a Mark and choosing
// another Volume.
export async function parishVolumes(astia: Astia, parish: string | null) {
  const archiveId = parishArchive(parish);
  return archiveId === null ? [] : await astia.archiveVolumes(archiveId);
}

// The parish archive holding the Volume, looked for among the archives
// of the parishes given, most cited first; an archive already crawled
// costs no request. Null when none holds it; an archive that can't be
// read is passed over, and throws only if the Volume isn't found
// elsewhere.
export async function archiveOf(
  astia: Astia,
  volumeId: string,
  parishes: Array<string | null>
) {
  const cited = new Map<string, number>();
  for (const p of parishes) {
    const archive = parishArchive(p);
    if (archive !== null) cited.set(archive, (cited.get(archive) ?? 0) + 1);
  }
  const order = [...cited.keys()].sort((a, b) => cited.get(b)! - cited.get(a)!);
  let failed: AstiaError | null = null;
  for (const archive of order) {
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
