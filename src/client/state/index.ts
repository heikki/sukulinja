// A dataset's app state: one store per concern, built over its Dataset API
// and provided to the screens by the app (ADR-0012).

import { createContext } from '@lit/context';

import type { DatasetApi } from '@/client/dataset-api';

import { openAssistant } from './assistant';
import type { Assistant } from './assistant';
import { openChanges } from './changes';
import type { Changes } from './changes';
import { openChart } from './chart';
import type { Chart } from './chart';
import { openFacts } from './facts';
import type { Facts } from './facts';
import { openPersonEdits } from './person-edits';
import type { PersonEdits } from './person-edits';
import { openPhotoViewer } from './photo-viewer';
import type { PhotoViewer } from './photo-viewer';
import { openPhotos } from './photos';
import type { Photos } from './photos';
import { openReminders } from './reminders';
import type { Reminders } from './reminders';
import { openSelected } from './selected';
import type { Selected } from './selected';
import { openViewer } from './viewer';
import type { Viewer } from './viewer';

export type { Assistant, Exchange } from './assistant';
export type { Changes } from './changes';
export type { Chart, ChartView, UrlView } from './chart';
export type { Facts } from './facts';
export type { Selected } from './selected';
export { isMarked } from './sources';
export { citingImage } from './pending-entry';
export type { LinkStatus, Source, SourceGroup } from './sources';
export type { Confirming } from './confirming';
export type { PendingTag, PhotosFrom, PhotoViewer } from './photo-viewer';
export type { Photos } from './photos';
export type { PersonEdits } from './person-edits';
export type { Reminders } from './reminders';
export type {
  ImageOpen,
  LeaveAnswer,
  LinkOpen,
  PendingCite,
  PendingLink,
  Viewer
} from './viewer';

export interface AppState {
  api: DatasetApi;
  selected: Selected;
  // What the Scan viewer shows; it depends on `selected`, not the other
  // way round.
  viewer: Viewer;
  // The Photo the Photo viewer shows. Only one viewer is open at a time.
  photoViewer: PhotoViewer;
  // Every Photo, as the Photos view lists them.
  photos: Photos;
  // The people, Root, and selecting someone: it moves `selected`, then
  // the viewer.
  chart: Chart;
  // The dataset's Reminders.
  reminders: Reminders;
  // What was done in the app to the dataset.
  changes: Changes;
  // Adding, changing and deleting the Selected person's Facts.
  facts: Facts;
  // Adding people to the tree as someone's relatives, and changing them.
  personEdits: PersonEdits;
  // The conversation with the assistant.
  assistant: Assistant;
}

export function openAppState(api: DatasetApi): AppState {
  const selected = openSelected(api);
  const photos = openPhotos(api);
  const photoViewer = openPhotoViewer(api, selected, photos, {
    // A Tag may be the crop of someone's portrait.
    tagged: () => {
      void chart.reloadPeople();
    }
  });
  const viewer = openViewer(api, selected, { opening: photoViewer.close });
  const chart = openChart(api, selected, viewer, photoViewer);
  const facts = openFacts(api, selected, {
    // A birth or death gives a card its years.
    saved: () => {
      void chart.reloadPeople();
    }
  });
  return {
    api,
    selected,
    viewer,
    photoViewer,
    photos,
    chart,
    reminders: openReminders(api),
    changes: openChanges(api),
    facts,
    personEdits: openPersonEdits(api, chart, selected),
    assistant: openAssistant(api)
  };
}

export const appState = createContext<AppState>(Symbol('app-state'));
