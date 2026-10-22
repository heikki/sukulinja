// Exporting a dataset: its GEDZIP, or a GEDCOM 5.5.1 file for MyHeritage.
// Saved by the server, since the app's web view can't hand a download to
// the user: into Downloads, which the note names, with what was left out.

import { ApiError } from '@/client/dataset-api';
import type { LifecycleApi } from '@/client/dataset-api/lifecycle';
import type { DatasetInfo, ExportKind } from '@/common/types';

// Each export named by its format, as the menu and the note word it.
export const EXPORT_FORMATS: Record<
  ExportKind,
  { name: string; detail: string }
> = {
  gdz: { name: 'GEDZIP', detail: 'GEDCOM 7 with photos' },
  myheritage: { name: 'GEDCOM 5.5.1', detail: 'no photos' }
};

export interface ExportNote {
  ok: boolean;
  text: string;
}

export async function exportDataset(
  api: LifecycleApi,
  dataset: DatasetInfo,
  kind: ExportKind
) {
  try {
    const saved = await api.exportAs(dataset.slug, kind);
    const left =
      saved.left.length === 0 ? '' : ` Left out: ${saved.left.join('; ')}.`;
    return {
      ok: true,
      text: `Exported ${dataset.displayName} as ${EXPORT_FORMATS[kind].name} to ${saved.path}.${left}`
    };
  } catch (err) {
    if (!(err instanceof ApiError)) throw err;
    return { ok: false, text: err.message };
  }
}
