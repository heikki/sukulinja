// A dataset's app state: one store per concern, built over its Dataset API
// and provided to the screens by the app (ADR-0012).

import type { DatasetApi } from '@client/dataset-api';
import { createContext } from '@lit/context';

import { openChart } from './chart';
import type { Chart } from './chart';
import { openSelected } from './selected';
import type { Selected } from './selected';
import { openViewer } from './viewer';
import type { Viewer } from './viewer';

export type { Chart, ChartView, People, UrlView } from './chart';
export type { Readable, Selected } from './selected';
export type { LinkStatus, Source, SourceGroup } from './sources';
export type {
  LeaveAnswer,
  LinkOpen,
  PendingLink,
  Viewer,
  VolumeShown
} from './viewer';

export interface AppState {
  api: DatasetApi;
  selected: Selected;
  // What the Scan viewer shows; it depends on `selected`, not the other
  // way round.
  viewer: Viewer;
  // The people, Root, and selecting someone: it moves `selected`, then
  // the viewer.
  chart: Chart;
}

export function openAppState(api: DatasetApi): AppState {
  const selected = openSelected(api);
  const viewer = openViewer(api, selected);
  return {
    api,
    selected,
    viewer,
    chart: openChart(api, selected, viewer)
  };
}

export const appState = createContext<AppState>(Symbol('app-state'));
