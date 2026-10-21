// Test support: an Astia answering from archives given in the test, so
// resolution and the Scan viewer run without a request going out. Volumes
// are written as Astia labels them, and read the way its own are.

import { AstiaError, NoImageError, volumeOf } from './astia';
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
  // "peek <volume>", "refresh <volume>", "title <archive>", "bytes <file>".
  asked: string[];
  // Astia re-scans the Volume: it now holds `images` Images under new file
  // ids, and has none by the old ones. Its list stays as it was until
  // refreshed, as a cached one would.
  rescan: (volumeId: string, images: number) => void;
};

// An Image's file id: `<volume>-f<n>` full size, `<volume>-t<n>` thumbnail,
// with the filming between them after a re-scan (`<volume>-2-f<n>`).
export function fileId(
  volumeId: string,
  image: number,
  size: ImageSize,
  filming = 1
) {
  const kind = size === 'full' ? 'f' : 't';
  const of = filming === 1 ? volumeId : `${volumeId}-${filming}`;
  return `${of}-${kind}${image}`;
}

interface Filming {
  filming: number;
  images: number;
}

function filmingIds(volumeId: string, { filming, images }: Filming) {
  return (['full', 'thumb'] as const).flatMap((size) =>
    Array.from({ length: images }, (_, i) =>
      fileId(volumeId, i + 1, size, filming)
    )
  );
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
  // Each Volume's filming as Astia holds it, and as its list gives it.
  const held = new Map<string, Filming>();
  const listed = new Map<string, Filming>();
  let refreshes = 0;
  // The Volumes peeked at since their list was last kept.
  const peekedAt = new Set<string>();

  function first(volumeId: string) {
    return { filming: 1, images: volume(volumeId).images };
  }

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

    rescan(volumeId, images) {
      const now = held.get(volumeId) ?? first(volumeId);
      listed.set(volumeId, listed.get(volumeId) ?? now);
      held.set(volumeId, { filming: now.filming + 1, images });
    },

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
      const { filming, images } = listed.get(volumeId) ?? first(volumeId);
      return await Promise.resolve(
        Array.from({ length: images }, (_, i) =>
          fileId(volumeId, i + 1, size, filming)
        )
      );
    },

    async cachedImages(volumeId) {
      const { filming, images } = listed.get(volumeId) ?? first(volumeId);
      return await Promise.resolve(
        Array.from({ length: images }, (_, i) =>
          fileId(volumeId, i + 1, 'full', filming)
        )
      );
    },

    async peekImages(volumeId) {
      ask(`peek ${volumeId}`);
      peekedAt.add(volumeId);
      const { filming, images } = held.get(volumeId) ?? first(volumeId);
      return await Promise.resolve(
        Array.from({ length: images }, (_, i) =>
          fileId(volumeId, i + 1, 'full', filming)
        )
      );
    },

    async refreshImages(volumeId) {
      ask(`refresh ${volumeId}`);
      listed.set(volumeId, held.get(volumeId) ?? first(volumeId));
      peekedAt.delete(volumeId);
      refreshes += 1;
      await Promise.resolve();
    },

    refreshed: () => refreshes,

    async isGone(volumeId, id) {
      if (!peekedAt.has(volumeId)) return await Promise.resolve(false);
      const now = held.get(volumeId) ?? first(volumeId);
      return !filmingIds(volumeId, now).includes(id);
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
      const now = held.get(volumeId) ?? first(volumeId);
      if (!filmingIds(volumeId, now).includes(id)) {
        throw new NoImageError(`no image ${id}`);
      }
      return await Promise.resolve(new Uint8Array([0xff, 0xd8]));
    }
  };
}
