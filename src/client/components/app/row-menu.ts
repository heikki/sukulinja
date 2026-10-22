// A dataset row's menu on the chooser: its exports and undo, behind a
// button so the row shows only its name and what it most needs.

import { html, nothing, svg } from 'lit';

import type { Point } from '@/client/pan-zoom';
import type { DatasetInfo, ExportKind } from '@/common/types';

import '../context-menu';

import type { MenuItem } from '../context-menu';
import { EXPORT_FORMATS } from './exports';
import { importDate } from './import-review';

const MENU_ICON = html`<svg viewBox="0 0 16 16" aria-hidden="true">
  ${svg`
    <path
      d="M 3 4.5 H 13 M 3 8 H 13 M 3 11.5 H 13"
      fill="none"
      stroke="currentColor"
      stroke-width="1.3"
      stroke-linecap="round"
    />
  `}
</svg>`;

// An open menu: its dataset, and the corner it drops from in the host.
export interface RowMenu {
  dataset: DatasetInfo;
  at: Point;
}

export interface RowMenuActions {
  export: (dataset: DatasetInfo, kind: ExportKind) => void;
  undo: (dataset: DatasetInfo) => void;
}

// An outdated dataset can't be exported until it's imported again, but its
// last import can still be undone.
function menuItems(d: DatasetInfo, on: RowMenuActions) {
  const items: MenuItem[] = [];
  if (!d.outdated) {
    for (const kind of ['gdz', 'myheritage'] as const) {
      const { name, detail } = EXPORT_FORMATS[kind];
      items.push({
        label: `Export ${name} (${detail})`,
        run: () => {
          on.export(d, kind);
        }
      });
    }
  }
  if (d.undoable) {
    items.push({
      label: `Undo last import (${importDate(d.importedAt)})`,
      run: () => {
        on.undo(d);
      }
    });
  }
  return items;
}

function stop(e: Event) {
  e.stopPropagation();
}

// Opens the menu under the button's right edge, in `host`'s coordinates, or
// closes it if it's this row's. The button keeps its press from the open
// menu, which would close on it and then open again on the click.
export function menuButton(
  d: DatasetInfo,
  menu: RowMenu | null,
  host: HTMLElement,
  set: (menu: RowMenu | null) => void
) {
  if (d.outdated && !d.undoable) return nothing;
  const open = menu?.dataset.slug === d.slug;
  return html`<button
    class="icon"
    aria-label=${`More for ${d.displayName}`}
    aria-haspopup="menu"
    aria-expanded=${open ? 'true' : 'false'}
    @mousedown=${stop}
    @click=${(e: Event) => {
      if (open) {
        set(null);
        return;
      }
      const button = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const box = host.getBoundingClientRect();
      set({
        dataset: d,
        at: { x: button.right - box.left, y: button.bottom - box.top + 4 }
      });
    }}
  >
    ${MENU_ICON}
  </button>`;
}

export function renderRowMenu(
  menu: RowMenu | null,
  on: RowMenuActions,
  close: () => void
) {
  if (menu === null) return nothing;
  return html`<sl-context-menu
    .items=${menuItems(menu.dataset, on)}
    .at=${menu.at}
    .alignRight=${true}
    @close=${close}
  ></sl-context-menu>`;
}
