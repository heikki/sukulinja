import { visionModel } from '@/client/assistant-choices';
import type { AppState } from '@/client/state';
import { pageCounts } from '@/common/page-numbering';
import type { PageMark, VolumesRow } from '@/common/types';

// The work a Volume's page numbers menu asks for. A survey or clearing
// shows the Volume in the Scan viewer first, which tells how they went;
// a mark tells the viewer too, should it show the Volume.
function at(book: VolumesRow) {
  return { volumeId: book.id, volume: book.label };
}

export function pageWork({ api, viewer }: AppState) {
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
      const { images } = await api.volumePages(at(book));
      return pageCounts(images);
    },
    async mark(book: VolumesRow, as: PageMark | null) {
      await api.markPages(at(book), as);
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
