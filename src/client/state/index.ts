// A dataset's app state: one store per concern, built over its Dataset API
// and provided to the screens by the app (ADR-0012).

import { createContext } from '@lit/context';

import type { DatasetApi } from '@client/dataset-api';

import { openSelected } from './selected';
import type { Selected } from './selected';
import { openViewer } from './viewer';
import type { Viewer } from './viewer';

export type { Readable, Selected } from './selected';
export type { LinkStatus, Source, SourceGroup } from './sources';
export type { LinkOpen, Viewer, VolumeShown } from './viewer';

export interface AppState {
  api: DatasetApi;
  selected: Selected;
  // What the Scan viewer shows; it depends on `selected`, not the other
  // way round.
  viewer: Viewer;
  // The one way to select someone: moves `selected`, then the viewer.
  select: (id: number) => void;
}

export function openAppState(api: DatasetApi): AppState {
  const selected = openSelected(api);
  const viewer = openViewer(api, selected);
  return {
    api,
    selected,
    viewer,
    select(id) {
      if (id === selected.id.get()) return;
      void selected.select(id);
      viewer.selected(id);
    }
  };
}

export const appState = createContext<AppState>(Symbol('app-state'));
