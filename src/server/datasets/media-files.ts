// A dataset's media files, in its media folder, each named by its content
// (a hash and its extension), so the same file is stored once however
// often it comes, and no two names clash.

import { createHash } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

// Stores the bytes under their name, unless they're there already: the
// name.
export async function storeMediaFile(
  bytes: Uint8Array,
  ext: string,
  mediaDir: string
): Promise<string> {
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
  const name = `${hash}${ext.toLowerCase()}`;
  const target = join(mediaDir, name);
  if (!(await Bun.file(target).exists())) {
    await mkdir(mediaDir, { recursive: true });
    await Bun.write(target, bytes);
  }
  return name;
}

// Removes a stored file; one that's gone already is fine.
export async function removeMediaFile(name: string, mediaDir: string) {
  await rm(join(mediaDir, name), { force: true });
}
