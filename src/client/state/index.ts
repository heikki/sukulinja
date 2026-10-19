// A dataset's app state: one store per concern, built over its Dataset API
// and provided to the screens by the app (ADR-0012).

import { createContext } from '@lit/context';

import type { DatasetApi } from '@client/dataset-api';

import { openSelected } from './selected';
import type { Selected } from './selected';

export type { Readable, Selected } from './selected';
export type { LinkStatus, Source, SourceGroup } from './sources';

export interface AppState {
  api: DatasetApi;
  selected: Selected;
  // The one way to select someone: moves `selected`.
  select: (id: number) => void;
}

export function openAppState(api: DatasetApi): AppState {
  const selected = openSelected(api);
  return {
    api,
    selected,
    select(id) {
      void selected.select(id);
    }
  };
}

export const appState = createContext<AppState>(Symbol('app-state'));
