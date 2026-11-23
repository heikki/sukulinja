import { visionModel } from '@/client/assistant-choices';
import type { AppState } from '@/client/state';
import type { PageMark, VolumesRow } from '@/common/types';

// The work a Volume's page numbers menu asks for. A survey or clearing
// shows the Volume in the Scan viewer first, which tells how they went;
// a mark tells the viewer too, should it show the Volume.
export function pageWork({ api, app, viewer }: AppState) {
  function shown(book: VolumesRow) {
    return viewer.volume.get()?.id === book.id;
  }
  // False when the viewer held on to what it showed, a change to answer.
  function show(book: VolumesRow) {
    if (!shown(book)) {
      viewer.openImage({ volumeId: book.id, volume: book.label, image: 1 });
    }
    return shown(book);
  }
  return {
    // How many Images have pages set by hand, and read or set at all.
    async counts(book: VolumesRow) {
      const pages = await api.volumePages({
        volumeId: book.id,
        volume: book.label
      });
      return {
        byHand: pages.filter((p) => p.by === 'hand').length,
        pinned: pages.filter((p) => p.by !== null).length
      };
    },
    async mark(book: VolumesRow, as: PageMark | null) {
      await app.markPages(book.id, as);
      if (shown(book)) await viewer.pages.load(book.id);
    },
    async survey(book: VolumesRow) {
      if (show(book)) await viewer.surveyPagesByVision(visionModel.get());
    },
    async clear(book: VolumesRow) {
      if (show(book)) await viewer.pages.clearVolume();
    }
  };
}
