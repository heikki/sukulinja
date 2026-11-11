// Which Astia archive holds a Volume, and so which parish's church books
// it's in.

import { AstiaError } from './astia';
import type { Astia } from './astia';

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
