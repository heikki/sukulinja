// Exporting a dataset as its GEDZIP. Saved by the server, since the app's
// web view can't hand a download to the user: into Downloads, which the
// note names.

import { ApiError } from '@/client/dataset-api';
import type { LifecycleApi } from '@/client/dataset-api/lifecycle';
import type { DatasetInfo } from '@/common/types';

// The export as the menu and the note word it.
export const EXPORT_FORMAT = {
  name: 'GEDZIP',
  detail: 'GEDCOM 7 with photos'
};

export interface ExportNote {
  ok: boolean;
  text: string;
}

export async function exportDataset(api: LifecycleApi, dataset: DatasetInfo) {
  try {
    const saved = await api.exportAs(dataset.slug);
    return {
      ok: true,
      text: `Exported ${dataset.displayName} as ${EXPORT_FORMAT.name} to ${saved.path}.`
    };
  } catch (err) {
    if (!(err instanceof ApiError)) throw err;
    return { ok: false, text: err.message };
  }
}
