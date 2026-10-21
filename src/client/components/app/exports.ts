// Exporting a dataset: its GEDZIP, or a GEDCOM 5.5.1 file for MyHeritage.
// Saved by the server, since the app's web view can't hand a download to
// the user: into Downloads, which the note names, with what was left out.

import type { DatasetInfo } from '@common/types';

export type ExportKind = 'gdz' | 'myheritage';

export interface ExportNote {
  ok: boolean;
  text: string;
}

export async function exportDataset(dataset: DatasetInfo, kind: ExportKind) {
  const path = kind === 'gdz' ? 'export' : 'export-myheritage';
  try {
    const res = await fetch(`/datasets/${dataset.slug}/${path}`, {
      method: 'POST'
    });
    if (!res.ok) {
      const msg = await res.text();
      return {
        ok: false,
        text: msg === '' ? `export failed (${res.status})` : msg
      };
    }
    const saved = (await res.json()) as { path: string; left: string[] };
    const what = kind === 'gdz' ? '' : ' for MyHeritage';
    const left =
      saved.left.length === 0 ? '' : ` Left out: ${saved.left.join('; ')}.`;
    return {
      ok: true,
      text: `Exported ${dataset.displayName}${what} to ${saved.path}.${left}`
    };
  } catch (err) {
    return {
      ok: false,
      text: err instanceof Error ? err.message : 'export failed'
    };
  }
}
