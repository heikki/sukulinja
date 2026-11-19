import { css, html, nothing, svg } from 'lit';
import type { TemplateResult } from 'lit';

import { cornerListStyles } from '../corner-panel/list-styles';
import {
  diskCell,
  diskLine,
  groupByArchive,
  pagesCell,
  seriesName,
  volumeCode,
  yearsText
} from './helpers';
import type { ArchiveGroup } from './helpers';
import type { VolumeRow } from './rows';

export const DOWNLOAD_ICON = svg`<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v12" /><path d="m6 11 6 6 6-6" /><path d="M5 20h14" /></svg>`;
export const STOP_ICON = svg`<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2" /></svg>`;
export const REMOVE_ICON = svg`<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6 6 18" /></svg>`;
export const CHECK_ICON = svg`<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>`;
export const OFFLOAD_ICON = svg`<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3" /><path d="m7 8 5-5 5 5" /><path d="M5 14v6h14v-6" /></svg>`;
export const BRING_BACK_ICON = svg`<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></svg>`;
export const TRASH_ICON = svg`<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M6 7l1 13h10l1-13" /><path d="M9 7V4h6v3" /></svg>`;

export interface BookTable {
  books: VolumeRow[];
  // The Volume the Scan viewer shows, marked, if any.
  shown: string | null;
  // The buttons at the end of each Volume's row.
  acts: (book: VolumeRow) => TemplateResult[];
  open: (book: VolumeRow) => void;
}

// How many of the dataset's Citations link into it; nothing for one off
// the Book list.
function citedCell(book: VolumeRow) {
  if (book.cited === null) return nothing;
  return book.cited === 0 ? html`<span class="count">–</span>` : book.cited;
}

function pagesOf(book: VolumeRow) {
  if (book.pages === null) return nothing;
  const { text, title } = pagesCell(book.pages);
  return html`<span title=${title}>${text}</span>`;
}

function renderBook(table: BookTable, book: VolumeRow) {
  return html`<tr
    class="book ${book.digitized ? '' : 'off'} ${book.id === table.shown ? 'shown' : ''}"
    aria-current=${book.id === table.shown ? 'true' : nothing}
    @click=${() => {
      if (book.digitized) table.open(book);
    }}
  >
    <td class="code" title=${book.label}>${volumeCode(book.label)}</td>
    <td class="muted">${seriesName(book.kind)}</td>
    <td class="muted">${yearsText(book.years)}</td>
    <td class="num">${citedCell(book)}</td>
    <td class="num">${pagesOf(book)}</td>
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

function renderGroup(table: BookTable, g: ArchiveGroup<VolumeRow>) {
  return html`<tbody>
    <tr class="archive">
      <td colspan="7">
        ${g.archive ?? 'Not in your parishes'}
        <span class="count">${g.books.length}</span>
      </td>
    </tr>
    ${g.books.map((b) => renderBook(table, b))}
  </tbody>`;
}

// The Volumes as a table by archive, each one's by series and years, with
// what of it is on disk; clicking a row opens its Volume.
export function renderBookTable(table: BookTable) {
  return html`<div class="table">
    <table>
      <thead>
        <tr>
          <th>Volume</th>
          <th>Series</th>
          <th>Years</th>
          <th class="num">Cited</th>
          <th class="num">Page numbers</th>
          <th class="num">Downloaded</th>
          <th></th>
        </tr>
      </thead>
      ${groupByArchive(table.books).map((g) => renderGroup(table, g))}
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
    disabled = false,
    pressed = null,
    onHint
  }: {
    title?: string;
    disabled?: boolean;
    pressed?: boolean | null;
    // Called as its title is about to show: pointed at or focused.
    onHint?: () => void;
  } = {}
) {
  return html`<button
    class="act"
    aria-label=${label}
    aria-pressed=${pressed === null ? nothing : String(pressed)}
    title=${title}
    ?disabled=${disabled}
    @click=${run}
    @mouseenter=${onHint}
    @focus=${onHint}
  >
    ${icon}
  </button>`;
}

// An icon button's place in a row without it.
export const EMPTY_SLOT = html`<span class="slot" aria-hidden="true"></span>`;

// Scrolls the table in `root` to centre the shown Volume's row; false when
// there's no such row yet.
export function revealShown(root: ShadowRoot | null) {
  if (root === null) return false;
  const row = root.querySelector<HTMLElement>('tr[aria-current="true"]');
  const box = root.querySelector<HTMLElement>('div.table');
  if (row === null || box === null) return false;
  const at = row.getBoundingClientRect();
  const from = at.top - box.getBoundingClientRect().top;
  box.scrollTop += from - (box.clientHeight - at.height) / 2;
  return true;
}

// Keeps an archive's name under the column headers, however tall they are,
// while its Volumes scroll by.
export function pinUnderHead(root: ShadowRoot | null) {
  const head = root?.querySelector<HTMLElement>('thead');
  const box = root?.querySelector<HTMLElement>('div.table');
  if (
    head === null ||
    head === undefined ||
    box === null ||
    box === undefined
  ) {
    return;
  }
  // A pixel under them, as their height needn't be whole.
  box.style.setProperty(
    '--head',
    `${head.getBoundingClientRect().height - 1}px`
  );
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

    button.act[aria-pressed='true'] {
      border-color: var(--accent);
      background: color-mix(in srgb, var(--accent) 18%, transparent);
      color: var(--accent);
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
      z-index: 2;
      padding: 0.3rem 0.35rem;
      background: var(--card);
      color: var(--muted);
      font-size: 0.7rem;
      font-weight: 500;
      letter-spacing: 0.04em;
      text-align: left;
      text-transform: uppercase;
      /* Not a border: a collapsed one isn't drawn with a sticky cell. */
      box-shadow: inset 0 -1px 0 var(--border);
    }

    td {
      padding: 0.3rem 0.35rem;
      border-bottom: 1px solid color-mix(in srgb, var(--fg) 6%, transparent);
      white-space: nowrap;
    }

    /* Under the headers while its Volumes scroll by. */
    tr.archive td {
      position: sticky;
      top: var(--head, 0);
      z-index: 1;
      background: var(--card);
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

    /* The one the Scan viewer shows. */
    tr.book.shown {
      background: color-mix(in srgb, var(--accent) 14%, transparent);
      box-shadow: inset 3px 0 0 var(--accent);
    }

    tr.book.off {
      cursor: default;
      color: var(--muted);
    }

    /* A label with no code in it is cut short; its title has it whole. */
    td.code {
      max-width: 9rem;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    td.num,
    th.num {
      text-align: right;
    }

    /* A download's line is long; it wraps before the buttons go. */
    td.disk {
      min-width: 5rem;
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

    td.acts > * + * {
      margin-left: 0.25rem;
    }

    /* Where a row has no such button: its place kept, so each button
       stays in its column. */
    span.slot {
      display: inline-block;
      width: 1.6rem;
      height: 1.6rem;
      vertical-align: middle;
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
