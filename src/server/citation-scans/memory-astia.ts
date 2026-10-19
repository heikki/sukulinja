// Test support: an Astia answering from archives given in the test, so
// resolution and the Scan viewer run without a request going out. Volumes
// are written as Astia labels them, and read the way its own are.

import { AstiaError, volumeOf } from './astia';
import type { Astia, ImageSize } from './astia';

export interface MemoryVolume {
  id: string;
  label: string;
  images: number;
  // Digitized unless said otherwise.
  digitized?: boolean;
}

export interface MemoryArchive {
  title?: string;
  volumes: MemoryVolume[];
}

export type MemoryAstia = Astia & {
  // What was asked, in order: "volumes <archive>", "images <volume>",
  // "title <archive>", "bytes <file>".
  asked: string[];
};

// An Image's file id: `<volume>-f<n>` full size, `<volume>-t<n>` thumbnail.
export function fileId(volumeId: string, image: number, size: ImageSize) {
  return `${volumeId}-${size === 'full' ? 'f' : 't'}${image}`;
}

export interface MemoryOptions {
  // Every request fails with an AstiaError, as when Astia is down.
  down?: boolean;
}

// The archives, by Astia id. Asking for an archive or Volume not given is
// a mistake in the test, and throws a plain Error; image bytes are a
// JPEG's first two.
export function memoryAstia(
  archives: Record<string, MemoryArchive>,
  { down = false }: MemoryOptions = {}
): MemoryAstia {
  const asked: string[] = [];

  function ask(what: string) {
    asked.push(what);
    if (down) throw new AstiaError(`Astia is down: ${what}`);
  }

  const volumes = new Map(
    Object.values(archives).flatMap((a) => a.volumes.map((v) => [v.id, v]))
  );

  function archive(id: string) {
    const found = archives[id];
    if (found === undefined) throw new Error(`no archive ${id} in this Astia`);
    return found;
  }

  function volume(id: string) {
    const found = volumes.get(id);
    if (found === undefined) throw new Error(`no volume ${id} in this Astia`);
    return found;
  }

  return {
    asked,

    async archiveVolumes(archiveId) {
      ask(`volumes ${archiveId}`);
      return await Promise.resolve(
        archive(archiveId).volumes.map((v) =>
          volumeOf({
            id: v.id,
            level: 'file',
            label: v.label,
            digitized: v.digitized ?? true
          })
        )
      );
    },

    async volumeImages(volumeId, size = 'full') {
      ask(`images ${volumeId}`);
      const v = volume(volumeId);
      return await Promise.resolve(
        Array.from({ length: v.images }, (_, i) => fileId(v.id, i + 1, size))
      );
    },

    async archiveTitle(archiveId) {
      // As over HTTP, a title Astia can't give is null.
      asked.push(`title ${archiveId}`);
      return await Promise.resolve(
        down ? null : (archives[archiveId]?.title ?? null)
      );
    },

    async imageBytes(volumeId, id) {
      ask(`bytes ${id}`);
      volume(volumeId);
      return await Promise.resolve(new Uint8Array([0xff, 0xd8]));
    }
  };
}
