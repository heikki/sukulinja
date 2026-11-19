import { consume } from '@lit/context';
import { css, html, LitElement, nothing, svg } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import { Asking } from '@/client/asking';
import { appState } from '@/client/state';
import type { AppState } from '@/client/state';
import type { ListedBook } from '@/common/types';

import { cornerListStyles } from '../corner-panel/list-styles';
import {
  busy,
  diskCell,
  downloadActions,
  groupByArchive,
  listSummary,
  matches,
  seriesName,
  volumeCode,
  yearsText
} from './helpers';
import type { DownloadAction } from './helpers';
import type { BookListEvent } from './picker';

import './picker';

const DOWNLOAD_ICON = svg`<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v12" /><path d="m6 11 6 6 6-6" /><path d="M5 20h14" /></svg>`;
const STOP_ICON = svg`<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2" /></svg>`;
const REMOVE_ICON = svg`<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6 6 18" /></svg>`;

// How often the list is asked for again while a Volume downloads.
const POLL_MS = 2000;

export type VolumeOpenEvent = CustomEvent<{ volumeId: string; label: string }>;

// The Volumes tab of the corner panel: the dataset's Book list as a table,
// by archive, each one's Volumes by series and years, with how many of
// the dataset's Citations link into each and what of it is on disk, and
// its download to start or stop. Typing filters it, by a year a Volume
// covers or words in it. One added by hand can be taken off. Clicking a
// row opens it (`open-volume`); _Add volumes…_ opens the Volume picker,
// whose Volumes join the list. Leaving the tab stops asking.
@customElement('sl-volumes-list')
class VolumesListElement extends LitElement {
  static override styles = [
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

      td.num {
        text-align: right;
      }

      /* A download's line is long; it wraps before the buttons go. */
      td.disk {
        min-width: 7rem;
        white-space: normal;
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

  @state() private books: ListedBook[] | 'failed' | null = null;

  @state() private filter = '';

  // Whether the Volume picker is open.
  @state() private picking = false;

  // Taking a Volume off, or starting its download; why it was refused.
  private readonly asking = new Asking(this);

  @consume({ context: appState }) private readonly state!: AppState;

  private poll: ReturnType<typeof setTimeout> | null = null;

  override connectedCallback() {
    super.connectedCallback();
    void this.load();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.stopPolling();
  }

  private stopPolling() {
    if (this.poll !== null) clearTimeout(this.poll);
    this.poll = null;
  }

  // The list, asked for again while any of it downloads; one that fails
  // keeps what was shown, once something was.
  private async load() {
    this.stopPolling();
    try {
      this.show(await this.state.api.bookList());
    } catch {
      if (!Array.isArray(this.books)) this.books = 'failed';
    }
  }

  private show(books: ListedBook[]) {
    this.books = books;
    this.stopPolling();
    if (busy(books) && this.isConnected) {
      this.poll = setTimeout(() => {
        void this.load();
      }, POLL_MS);
    }
  }

  private async act(book: ListedBook, action: DownloadAction) {
    const { app } = this.state;
    const send = action === 'start' ? app.startDownload : app.stopDownload;
    await send(book.id).catch(() => undefined);
    await this.load();
  }

  private async unlist(book: ListedBook) {
    await this.asking.run(async () => {
      this.show(await this.state.api.unlistBook(book.id));
    });
  }

  private readonly onListed = (e: BookListEvent) => {
    this.show(e.detail);
  };

  private open(volumeId: string, label: string) {
    this.dispatchEvent(
      new CustomEvent('open-volume', { detail: { volumeId, label } })
    );
  }

  private renderBook(book: ListedBook) {
    return html`<tr
      class="book ${book.digitized ? '' : 'off'}"
      @click=${() => {
        if (book.digitized) this.open(book.id, book.label);
      }}
    >
      <td title=${book.label}>${volumeCode(book.label)}</td>
      <td class="muted">${seriesName(book.kind)}</td>
      <td class="muted">${yearsText(book.years)}</td>
      <td class="num ${book.cited === 0 ? 'muted' : ''}">
        ${book.cited === 0 ? '–' : book.cited}
      </td>
      <td class="muted disk">${diskCell(book)}</td>
      <td
        class="acts"
        @click=${(e: Event) => {
          e.stopPropagation();
        }}
      >
        ${downloadActions(book).map(
          ({ action, label }) =>
            html`<button
              class="act"
              aria-label=${label}
              title=${label}
              @click=${() => {
                void this.act(book, action);
              }}
            >
              ${action === 'start' ? DOWNLOAD_ICON : STOP_ICON}
            </button>`
        )}
        ${
          book.added && book.cited === 0
            ? html`<button
                class="act"
                aria-label="Remove"
                title="Remove from the list"
                ?disabled=${this.asking.busy}
                @click=${() => {
                  void this.unlist(book);
                }}
              >
                ${REMOVE_ICON}
              </button>`
            : nothing
        }
      </td>
    </tr>`;
  }

  private renderTable(books: ListedBook[]) {
    const shown = books.filter((b) => matches(b, this.filter));
    if (books.length === 0) {
      return html`<p class="muted">
        No sources here cite a Volume yet. Add volumes to look through.
      </p>`;
    }
    if (shown.length === 0) {
      return html`<p class="muted">No volume here matches.</p>`;
    }
    return html`<div class="table">
      <table>
        <thead>
          <tr>
            <th>Volume</th>
            <th>Series</th>
            <th>Years</th>
            <th class="num">Cited</th>
            <th>On disk</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${groupByArchive(shown).map(
            (g) =>
              html`<tr class="archive">
                  <td colspan="6">
                    ${g.archive}
                    <span class="count">${g.books.length}</span>
                  </td>
                </tr>
                ${g.books.map((b) => this.renderBook(b))}`
          )}
        </tbody>
      </table>
    </div>`;
  }

  private renderBody() {
    const { books } = this;
    if (books === null) return html`<p class="muted">Loading…</p>`;
    if (books === 'failed') {
      return html`<p class="muted">
        Astia couldn't be reached, and the volumes here aren't known yet.
      </p>`;
    }
    return html`${this.renderTable(books)}
      <p class="summary">${listSummary(books)}</p>`;
  }

  override render() {
    const listed = Array.isArray(this.books) ? this.books : [];
    return html`
      <div class="bar">
        <input
          aria-label="Filter volumes"
          placeholder="Filter by year or name"
          .value=${this.filter}
          @input=${(e: InputEvent) => {
            this.filter = (e.target as HTMLInputElement).value;
          }}
        />
        <button
          class="add"
          @click=${() => {
            this.picking = true;
          }}
        >
          Add volumes…
        </button>
      </div>
      ${this.renderBody()}
      ${
        this.asking.refused === null
          ? nothing
          : html`<p class="refused">${this.asking.refused}</p>`
      }
      ${
        this.picking
          ? html`<sl-volume-picker
              .listed=${new Set(listed.map((b) => b.id))}
              @book-listed=${this.onListed}
              @open-volume=${(e: VolumeOpenEvent) => {
                this.picking = false;
                this.open(e.detail.volumeId, e.detail.label);
              }}
              @close=${() => {
                this.picking = false;
              }}
            ></sl-volume-picker>`
          : nothing
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-volumes-list': VolumesListElement;
  }
}
