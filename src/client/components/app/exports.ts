// Exporting a dataset: its GEDZIP, or a GEDCOM 5.5.1 file for MyHeritage.
// Saved by the server, since the app's web view can't hand a download to
// the user: into Downloads, which the note names, with what was left out.

import type { DatasetInfo } from '@common/types';

export type ExportKind = 'gdz' | 'myheritage';

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
    const left =
      saved.left.length === 0 ? '' : ` Left out: ${saved.left.join('; ')}.`;
    return {
      ok: true,
      text: `Exported ${dataset.displayName} as ${EXPORT_FORMATS[kind].name} to ${saved.path}.${left}`
    };
  } catch (err) {
    return {
      ok: false,
      text: err instanceof Error ? err.message : 'export failed'
    };
  }
}
