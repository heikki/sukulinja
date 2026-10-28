// A dataset's app state: one store per concern, built over its Dataset API
// and provided to the screens by the app (ADR-0012).

import { createContext } from '@lit/context';

import type { DatasetApi } from '@/client/dataset-api';

import { openChart } from './chart';
import type { Chart } from './chart';
import { openReminders } from './reminders';
import type { Reminders } from './reminders';
import { openSelected } from './selected';
import type { Selected } from './selected';
import { openViewer } from './viewer';
import type { Viewer } from './viewer';

export type { Chart, ChartView, UrlView } from './chart';
export type { Selected } from './selected';
export type { LinkStatus, Source, SourceGroup } from './sources';
export type { Confirming } from './confirming';
export type { Reminders } from './reminders';
export type {
  ImageOpen,
  LeaveAnswer,
  LinkOpen,
  PendingLink,
  Viewer
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
  // The dataset's Reminders.
  reminders: Reminders;
}

export function openAppState(api: DatasetApi): AppState {
  const selected = openSelected(api);
  const viewer = openViewer(api, selected);
  return {
    api,
    selected,
    viewer,
    chart: openChart(api, selected, viewer),
    reminders: openReminders(api)
  };
}

export const appState = createContext<AppState>(Symbol('app-state'));
