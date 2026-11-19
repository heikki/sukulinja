import { consume } from '@lit/context';
import { html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { Asking } from '@/client/asking';
import { appState } from '@/client/state';
import type { AppState } from '@/client/state';
import type { ListedBook } from '@/common/types';

import { busy, downloadActions, listSummary, matches } from './helpers';
import type { DownloadAction } from './helpers';
import type { BookListEvent, VolumeOpen } from './picker';
import {
  actButton,
  bookTableStyles,
  DOWNLOAD_ICON,
  EMPTY_SLOT,
  pinUnderHead,
  REMOVE_ICON,
  renderBookTable,
  renderRefused,
  revealShown,
  STOP_ICON
} from './table';

import './picker';

// How often the list is asked for again while a Volume downloads.
const POLL_MS = 2000;

// The Volumes tab's _This tree_: the dataset's Book list as a table,
// by archive, each one's Volumes by series and years, with how many of
// the dataset's Citations link into each and what of it is on disk, and
// its download to start or stop. Typing filters it, by a year a Volume
// covers or words in it. One added by hand can be taken off. Clicking a
// row opens it (`open-volume`); _Add volumes…_ opens the Volume picker,
// whose Volumes join the list. Leaving the tab stops asking.
@customElement('sl-book-list')
class BookListElement extends LitElement {
  static override styles = bookTableStyles;

  @state() private books: ListedBook[] | 'failed' | null = null;

  @state() private filter = '';

  // The Volume the Scan viewer shows, marked in the table.
  @property({ attribute: false }) shown: string | null = null;

  // The shown Volume last scrolled to, so it's brought into view once as
  // the list opens and again only when another is shown.
  private revealed: string | null = null;

  // Whether the Volume picker is open.
  @state() private picking = false;

  // Taking a Volume off, or starting its download; why it was refused.
  private readonly asking = new Asking(this);

  @consume({ context: appState }) private readonly state!: AppState;

  private poll: ReturnType<typeof setTimeout> | null = null;

  override connectedCallback() {
    super.connectedCallback();
    this.revealed = null;
    void this.load();
  }

  override updated() {
    pinUnderHead(this.shadowRoot);
    if (this.shown !== this.revealed && revealShown(this.shadowRoot)) {
      this.revealed = this.shown;
    }
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

  // Its download, then taking it off the list, each in its place.
  private renderActs(book: ListedBook) {
    const [download] = downloadActions(book);
    return [
      download === undefined
        ? EMPTY_SLOT
        : actButton(
            download.label,
            download.action === 'start' ? DOWNLOAD_ICON : STOP_ICON,
            () => {
              void this.act(book, download.action);
            }
          ),
      !book.added || book.cited > 0
        ? EMPTY_SLOT
        : actButton(
            'Remove',
            REMOVE_ICON,
            () => {
              void this.unlist(book);
            },
            { title: 'Remove from the list', disabled: this.asking.busy }
          )
    ];
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
    return renderBookTable({
      books: shown,
      shown: this.shown,
      column: {
        header: 'Cited',
        cell: (b) =>
          b.cited === 0 ? html`<span class="count">–</span>` : b.cited
      },
      acts: (b) => this.renderActs(b),
      noArchive: 'Not in your parishes',
      open: (b) => {
        this.open(b.id, b.label);
      }
    });
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
      ${this.renderBody()} ${renderRefused(this.asking.refused)}
      ${
        this.picking
          ? html`<sl-volume-picker
              @book-listed=${this.onListed}
              @open-volume=${(e: CustomEvent<VolumeOpen>) => {
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
    'sl-book-list': BookListElement;
  }
}
