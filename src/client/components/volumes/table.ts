import { css, html, nothing, svg } from 'lit';
import type { TemplateResult } from 'lit';

import type { ChurchBookVolume } from '@/common/types';

import { cornerListStyles } from '../corner-panel/list-styles';
import {
  diskCell,
  diskLine,
  groupByArchive,
  seriesName,
  volumeCode,
  yearsText
} from './helpers';
import type { ArchiveGroup } from './helpers';

export const DOWNLOAD_ICON = svg`<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v12" /><path d="m6 11 6 6 6-6" /><path d="M5 20h14" /></svg>`;
export const STOP_ICON = svg`<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2" /></svg>`;
export const REMOVE_ICON = svg`<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6 6 18" /></svg>`;
export const TRASH_ICON = svg`<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M6 7l1 13h10l1-13" /><path d="M9 7V4h6v3" /></svg>`;

// A Volume in a table of the Volumes tab, grouped under its archive.
type Book = ChurchBookVolume & {
  archiveId: string | null;
  archive: string | null;
};

export interface BookTable<T extends Book> {
  books: T[];
  // A column between the years and what's on disk, if any: its header,
  // and each Volume's cell.
  column?: { header: string; cell: (book: T) => unknown };
  // The buttons at the end of each Volume's row.
  acts: (book: T) => TemplateResult[];
  // The archive's heading for the Volumes of none.
  noArchive: string;
  open: (book: T) => void;
}

function renderBook<T extends Book>(table: BookTable<T>, book: T) {
  return html`<tr
    class="book ${book.digitized ? '' : 'off'}"
    @click=${() => {
      if (book.digitized) table.open(book);
    }}
  >
    <td title=${book.label}>${volumeCode(book.label)}</td>
    <td class="muted">${seriesName(book.kind)}</td>
    <td class="muted">${yearsText(book.years)}</td>
    ${
      table.column === undefined
        ? nothing
        : html`<td class="num">${table.column.cell(book)}</td>`
    }
    <td class="muted disk" title=${diskLine(book)}>${diskCell(book)}</td>
    <td
      class="acts"
      @click=${(e: Event) => {
        e.stopPropagation();
      }}
    >
      ${table.acts(book)}
    </td>
  </tr>`;
}

function renderGroup<T extends Book>(table: BookTable<T>, g: ArchiveGroup<T>) {
  return html`<tr class="archive">
      <td colspan=${table.column === undefined ? 5 : 6}>
        ${g.archive ?? table.noArchive}
        <span class="count">${g.books.length}</span>
      </td>
    </tr>
    ${g.books.map((b) => renderBook(table, b))}`;
}

// The Volumes as a table by archive, each one's by series and years, with
// what of it is on disk; clicking a row opens its Volume.
export function renderBookTable<T extends Book>(table: BookTable<T>) {
  return html`<div class="table">
    <table>
      <thead>
        <tr>
          <th>Volume</th>
          <th>Series</th>
          <th>Years</th>
          ${
            table.column === undefined
              ? nothing
              : html`<th class="num">${table.column.header}</th>`
          }
          <th class="num">On disk</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${groupByArchive(table.books).map((g) => renderGroup(table, g))}
      </tbody>
    </table>
  </div>`;
}

// An icon button at the end of a row.
export function actButton(
  label: string,
  icon: unknown,
  run: () => void,
  {
    title = label,
    disabled = false
  }: { title?: string; disabled?: boolean } = {}
) {
  return html`<button
    class="act"
    aria-label=${label}
    title=${title}
    ?disabled=${disabled}
    @click=${run}
  >
    ${icon}
  </button>`;
}

// A note under the table, or nothing.
export function renderRefused(refused: string | null) {
  return refused === null ? nothing : html`<p class="refused">${refused}</p>`;
}

export const bookTableStyles = [
  cornerListStyles,
  css`
    .bar {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
    }

    .bar input {
      flex: 1;
      min-width: 0;
      padding: 0.3rem 0.5rem;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--bg);
      color: var(--fg);
      font: inherit;
      font-size: 0.85rem;
    }

    button.act {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1.6rem;
      height: 1.6rem;
      padding: 0;
      vertical-align: middle;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: none;
      color: var(--fg);
      font-size: 0.8rem;
    }

    button.act:hover,
    button.add:hover {
      border-color: var(--accent);
      color: var(--accent);
    }

    button.add {
      flex: none;
      padding: 0.3rem 0.65rem;
      border: 1px solid var(--accent);
      border-radius: 6px;
      background: none;
      color: var(--accent);
      font-size: 0.85rem;
    }

    .table {
      flex: 1;
      min-height: 0;
      overflow: auto;
      margin: 0 -0.75rem;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.85rem;
    }

    th {
      position: sticky;
      top: 0;
      padding: 0.3rem 0.5rem;
      background: var(--card);
      color: var(--muted);
      font-size: 0.7rem;
      font-weight: 500;
      letter-spacing: 0.04em;
      text-align: left;
      text-transform: uppercase;
      border-bottom: 1px solid var(--border);
    }

    td {
      padding: 0.3rem 0.5rem;
      border-bottom: 1px solid color-mix(in srgb, var(--fg) 6%, transparent);
      white-space: nowrap;
    }

    tr.archive td {
      padding-top: 0.75rem;
      font-weight: 600;
      border-bottom: 0;
      white-space: normal;
    }

    tr.book {
      cursor: pointer;
    }

    tr.book:hover {
      background: color-mix(in srgb, var(--fg) 6%, transparent);
    }

    tr.book.off {
      cursor: default;
      color: var(--muted);
    }

    td.num,
    th.num {
      text-align: right;
    }

    /* A download's line is long; it wraps before the buttons go. */
    td.disk {
      min-width: 7rem;
      white-space: normal;
      text-align: right;
    }

    td.muted,
    .count {
      color: var(--muted);
      font-weight: 400;
    }

    td.acts {
      text-align: right;
    }

    td.acts button + button {
      margin-left: 0.25rem;
    }

    p.summary {
      margin: 0.5rem 0 0;
      color: var(--muted);
      font-size: 0.8rem;
    }

    p.refused {
      margin: 0.5rem 0 0;
      color: var(--danger);
      font-size: 0.85rem;
    }
  `
];
