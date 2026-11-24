// The memory fake's page numbers (memory.ts): each Volume's Page pins
// counted as the server counts them (common/page-numbering), and its
// mark, which locks them as the server's does.

import { bookKind } from '@/common/books';
import { pageNumbering } from '@/common/page-numbering';
import type { NumberedPin } from '@/common/page-numbering';
import type { PageMark, VolumePages } from '@/common/types';

import { ApiError } from './ask';
import type { DatasetApi } from './index';

type Answer = <T>(
  what: string,
  signal: AbortSignal | undefined,
  give: () => T
) => Promise<T>;

// What of a Volume its page numbers are counted from.
export interface PagedVolume {
  images: number;
  // Its Page pins, which its pages are counted from as the app counts
  // them.
  pins?: NumberedPin[];
  // Its page numbers marked checked, or as none: locked.
  mark?: PageMark;
}

// The pages the Volume's Page pins put on its Images, `label` by its
// label, as the server counts them, and what's known of its numbering.
function pagesOf(v: PagedVolume, label: string): VolumePages {
  const numbering = v.mark ?? ((v.pins ?? []).length > 0 ? 'read' : 'counted');
  if (v.mark === 'none') {
    const images = Array.from({ length: v.images }, (_, i) => ({
      image: i + 1,
      pages: [],
      by: null
    }));
    return { images, numbering };
  }
  const images = pageNumbering(v.pins ?? [], v.images, bookKind(label)).pages();
  return { images, numbering };
}

// The Volume, unless its page numbers are locked: then refused, as the
// server refuses.
function unlocked<V extends PagedVolume>(v: V) {
  if (v.mark !== undefined) {
    throw new ApiError('The page numbers of this Volume are locked.');
  }
  return v;
}

export function memoryPages(
  volume: (volumeId: string) => PagedVolume,
  answer: Answer
): Pick<
  DatasetApi,
  'volumePages' | 'setImagePage' | 'clearVolumePages' | 'markPages'
> {
  return {
    volumePages: async ({ volumeId, volume: label }, signal) =>
      await answer(`pages ${volumeId}`, signal, () =>
        pagesOf(volume(volumeId), label)
      ),

    // A hand Page pin replaces any pin on the Image: the pages around it
    // are counted anew, though the estimates aren't.
    setImagePage: async ({ volumeId, volume: label, image }, pages) =>
      await answer(
        `page ${volumeId}/${image} ${pages?.join('-') ?? 'none'}`,
        undefined,
        () => {
          const shown = unlocked(volume(volumeId));
          const others = (shown.pins ?? []).filter((p) => p.image !== image);
          const numbering = pageNumbering(
            others,
            shown.images,
            bookKind(label)
          );
          const set =
            pages === null
              ? []
              : [
                  {
                    image,
                    pages:
                      pages.length === 1
                        ? numbering.pinPages(pages[0]!)
                        : pages,
                    by: 'hand' as const
                  }
                ];
          shown.pins = [...others, ...set];
          return pagesOf(shown, label);
        }
      ),

    clearVolumePages: async ({ volumeId, volume: label }) =>
      await answer(`pages cleared ${volumeId}`, undefined, () => {
        const shown = unlocked(volume(volumeId));
        shown.pins = [];
        return pagesOf(shown, label);
      }),

    markPages: async ({ volumeId, volume: label }, as) =>
      await answer(
        `pages marked ${volumeId} ${as ?? 'none'}`,
        undefined,
        () => {
          const shown = volume(volumeId);
          if (as === null) delete shown.mark;
          else shown.mark = as;
          return pagesOf(shown, label);
        }
      )
  };
}
