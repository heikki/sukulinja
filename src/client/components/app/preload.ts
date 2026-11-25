import type { AppApi } from '@/client/dataset-api/app';
import type { AppState } from '@/client/state';

import { preloadPhotos } from '../photos-list';
import { preloadSettings } from '../settings/known';
import { preloadVolumes } from '../volumes';

// Everything asked for ahead, as a page opens, so a popover or tab opened
// the first time draws at once, at its full size, rather than growing as
// answers arrive: Settings' rows on every page, the chooser's too, and a
// dataset's Volumes and Photos inside one. Each keeps what it heard where
// its screen looks first, and the screen still asks again as it opens.
export function preload(app: AppApi, dataset: AppState | null) {
  preloadSettings(app);
  if (dataset === null) return;
  preloadVolumes(dataset.api);
  preloadPhotos(dataset);
}
