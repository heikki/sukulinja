import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { css, html, LitElement, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import { Asking } from '@/client/asking';
import { visionModel } from '@/client/assistant-choices';
import { assistantOn } from '@/client/assistant-flag';
import type { DatasetApi } from '@/client/dataset-api';
import type { Point } from '@/client/pan-zoom';
import { appState } from '@/client/state';
import type { AppState } from '@/client/state';
import { CLAUDE_MODELS } from '@/common/assistant-choices';
import type { VolumesRow, VolumesView } from '@/common/types';

import { formatBytes } from '../settings/helpers';
import { busy, listSummary, matches } from './helpers';
import type { DownloadAction } from './helpers';
import { renderLeaveDialog } from './leave-dialog';
import { pageWork } from './page-work';
import { clearAsk, renderPagesMenu, surveyAsk } from './pages-menu';
import type { PagesActions, PagesMenu } from './pages-menu';
import type { BookListEvent, VolumeOpen } from './picker';
import { renderActs } from './row-acts';
import type { RowActions } from './row-acts';
import {
  bookTableStyles,
  pinUnderHead,
  renderBookTable,
  renderRefused,
  revealShown
} from './table';

import './picker';

export type VolumeOpenEvent = CustomEvent<VolumeOpen>;

// Where the table would be, why there's none.
function renderEmpty(why: string) {
  return html`<div class="table"><p class="empty">${why}</p></div>`;
}

// How often the Volumes are asked for again while one downloads.
const POLL_MS = 2000;

// The Volumes tab of the corner panel: one table by archive, of the
// dataset's Book list (_This tree_) or of every Volume with something on
// this computer, whatever tree it's of (_All books_), the choice offered
// only when this computer has Volumes the Book list leaves out. Either
// way each Volume says how many of the dataset's Citations link into it,
// its page numbers and how much of it is downloaded. A right-click on
// its row opens the menu of its page numbers; its buttons start or stop its
// download (an offloaded one brought back first), or offload one
// downloaded whole with an offload folder attached, and a trash button
// removes all of it, from disk and from the folder (asked first); with
// nothing left, one added by hand and cited nowhere is taken off the list. Typing filters
// it, by a year a Volume covers or words in it. Clicking a row opens it
// (`open-volume`); the one the Scan viewer shows is marked. _Add
// volumes…_ opens the Volume picker, whose Volumes join the Book list.
// Leaving the tab stops asking.
// Each dataset's view as its tab last showed it, and its This tree / All
// books choice.
const lastViews = new WeakMap<object, VolumesView>();
const lastTreeOnly = new WeakMap<object, boolean>();

// Asks for the dataset's view as it opens, so even the tab's first opening
// has one to show at once.
export function preloadVolumes(api: DatasetApi) {
  void api
    .volumesView()
    .then((view) => {
      if (!lastViews.has(api)) lastViews.set(api, view);
    })
    .catch(() => undefined);
}

@customElement('sl-volumes-list')
class VolumesListElement extends SignalWatcher(LitElement) {
  static override styles = [
    bookTableStyles,
    css`
      :host {
        position: relative;
        display: flex;
        flex: 1;
        min-height: 0;
        flex-direction: column;
      }

      /* This tree or All books, side by side in one frame. */
      .modes {
        flex: none;
        display: flex;
        padding: 2px;
        border: 1px solid var(--border);
        border-radius: 8px;
      }

      .modes button {
        padding: 0.2rem 0.65rem;
        border: 0;
        border-radius: 6px;
        background: none;
        color: var(--muted);
        font: inherit;
        font-size: 0.85rem;
        cursor: pointer;
      }

      .modes button[aria-pressed='true'] {
        background: var(--border);
        color: var(--fg);
      }

      p.empty {
        margin: 0.75rem 0 0;
        color: var(--muted);
        font-size: 0.85rem;
      }

      .foot .summary {
        flex: 1;
        margin: 0;
      }

      /* On one line with the summary: its words, then the meter. */
      .cache {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        color: var(--muted);
        font-size: 0.8rem;
        white-space: nowrap;
      }

      .meter {
        width: 5rem;
        height: 4px;
        border-radius: 2px;
        background: color-mix(in srgb, var(--fg) 10%, transparent);
        overflow: hidden;
      }

      .meter span {
        display: block;
        height: 100%;
        background: var(--accent);
      }
    `
  ];

  @consume({ context: appState }) private readonly state!: AppState;

  // Whether only the Book list's Volumes are shown, or every one on this
  // computer too.
  @state() private treeOnly = true;
  @state() private view: VolumesView | 'failed' | null = null;
  @state() private filter = '';

  // Whether the Volume picker is open.
  @state() private picking = false;

  // The menu of a Volume's page numbers, or its question, while open.
  @state() private pagesMenu: PagesMenu | null = null;

  // The Volume whose removal waits to be confirmed.
  @state() private confirming: VolumesRow | null = null;

  // What offloading a Volume would free, by its id, asked as its Offload
  // is pointed at; null when that can't be known.
  @state() private frees = new Map<string, number | null>();

  // The shown Volume last scrolled to, so it's brought into view once as
  // the tab opens and again only when another is shown.
  private revealed: string | null = null;

  private readonly asking = new Asking(this);

  private poll: ReturnType<typeof setTimeout> | null = null;

  override connectedCallback() {
    super.connectedCallback();
    this.revealed = null;
    // The tab is made anew each time it opens: what it showed last is
    // shown at once, and the view asked for behind it.
    this.view = lastViews.get(this.state.api) ?? this.view;
    this.treeOnly = lastTreeOnly.get(this.state.api) ?? this.treeOnly;
    void this.load();
  }

  override updated() {
    pinUnderHead(this.shadowRoot);
    const shown = this.shownId();
    if (shown !== this.revealed && revealShown(this.shadowRoot)) {
      this.revealed = shown;
    }
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.stopPolling();
  }

  private shownId() {
    return this.state.viewer.volume.get()?.id ?? null;
  }

  private stopPolling() {
    if (this.poll !== null) clearTimeout(this.poll);
    this.poll = null;
  }

  // The view, asked for again while any Volume downloads; one that fails
  // keeps what was shown, once something was.
  private async load() {
    this.stopPolling();
    const view = await this.state.api.volumesView().catch(() => null);
    if (view === null) this.view ??= 'failed';
    else {
      this.view = view;
      lastViews.set(this.state.api, view);
    }
    this.frees = new Map();
    const going = view !== null && busy(view.rows);
    if (going && this.isConnected) {
      this.poll = setTimeout(() => {
        void this.load();
      }, POLL_MS);
    }
  }

  // Done, refused or not, then the view asked for again.
  private async doing(work: () => Promise<unknown>) {
    await this.asking.run(async () => {
      await work();
    });
    await this.load();
  }

  // The row's menu where it was right-clicked: its page numbers'.
  private readonly openMenu = (book: VolumesRow, e: MouseEvent) => {
    e.preventDefault();
    if (this.asking.busy) return;
    const box = this.getBoundingClientRect();
    this.pagesMenu = {
      book,
      at: { x: e.clientX - box.left, y: e.clientY - box.top }
    };
  };

  // Asked first when it takes pages away; a survey taking none isn't.
  private async askPages(
    book: VolumesRow,
    at: Point,
    what: 'survey' | 'clear'
  ) {
    const work = pageWork(this.state);
    const run = () => {
      void this.doing(async () => {
        await work[what](book);
      });
    };
    const { byHand, pinned } = await work.counts(book).catch(() => ({
      byHand: 0,
      pinned: 0
    }));
    if (what === 'survey' && byHand === 0) {
      run();
      return;
    }
    // Another menu opened while counting: that one stays.
    if (this.pagesMenu !== null) return;
    this.pagesMenu = {
      book,
      at,
      ask: {
        run,
        ask:
          what === 'survey'
            ? {
                title: 'Survey page numbers?',
                text: surveyAsk(byHand),
                step: 'Survey',
                tone: 'danger'
              }
            : {
                title: 'Clear page numbers?',
                text: clearAsk(pinned),
                step: 'Clear',
                tone: 'danger'
              }
      }
    };
  }

  private pagesActions(): PagesActions {
    const model = visionModel.get();
    return {
      model: assistantOn.get()
        ? (CLAUDE_MODELS.find((m) => m.id === model)?.label ?? model)
        : null,
      mark: (book, as) => {
        void this.doing(async () => {
          await pageWork(this.state).mark(book, as);
        });
      },
      survey: (book, at) => {
        void this.askPages(book, at, 'survey');
      },
      clear: (book, at) => {
        void this.askPages(book, at, 'clear');
      }
    };
  }

  private readonly does: Omit<RowActions, 'busy' | 'frees'> = {
    askFrees: (book) => {
      void this.askFrees(book.id);
    },
    download: (book, action: DownloadAction) => {
      const { app } = this.state;
      const send = action === 'start' ? app.startDownload : app.stopDownload;
      void this.doing(async () => {
        await send(book.id);
      });
    },
    // At once, as nothing leaves for good.
    offload: (book) => {
      void this.doing(async () => {
        await this.state.app.offload(book.id);
      });
    },
    remove: (book) => {
      this.confirming = book;
    },
    unlist: (book) => {
      void this.doing(async () => await this.state.api.unlistBook(book.id));
    }
  };

  // Asked once for each showing of the Volumes.
  private async askFrees(volumeId: string) {
    if (this.frees.has(volumeId)) return;
    this.frees.set(volumeId, null);
    const freed = await this.state.app.offloadFrees(volumeId).catch(() => null);
    this.frees = new Map(this.frees).set(volumeId, freed);
  }

  // All of it off the disk and out of the offload folder.
  private async removeVolume(book: VolumesRow) {
    this.confirming = null;
    await this.doing(async () => {
      await this.state.app.removeVolume(book.id);
    });
  }

  // The picker changed the Book list: the view asked for again.
  private readonly onListed = (_: BookListEvent) => {
    void this.load();
  };

  private open(volumeId: string, label: string) {
    this.dispatchEvent(
      new CustomEvent('open-volume', { detail: { volumeId, label } })
    );
  }

  // The view once it's loaded.
  private loaded() {
    return typeof this.view === 'object' ? this.view : null;
  }

  // The filter to the Book list, when this computer has more.
  private offered() {
    return this.loaded()?.rows.some((r) => !r.onList) ?? false;
  }

  // The switch shows while the view loads too, so the bar doesn't shift
  // when it arrives; it goes only once the view says there's nothing more.
  private renderModes() {
    if (this.view !== null && !this.offered()) return nothing;
    const waiting = this.view === null;
    const modes = [
      { label: 'This tree', treeOnly: true },
      { label: 'All books', treeOnly: false }
    ];
    return html`<div class="modes" role="group" aria-label="Volumes shown">
      ${modes.map(
        (m) =>
          html`<button
            aria-pressed=${this.treeOnly === m.treeOnly ? 'true' : 'false'}
            ?disabled=${waiting}
            @click=${() => {
              this.treeOnly = m.treeOnly;
              lastTreeOnly.set(this.state.api, m.treeOnly);
            }}
          >
            ${m.label}
          </button>`
      )}
    </div>`;
  }

  private renderCache() {
    const storage = this.loaded()?.storage;
    if (storage === undefined) return html`<span class="cache"></span>`;
    const pct = Math.min(100, (storage.used / storage.cap) * 100);
    return html`<span class="cache">
      Storage ${formatBytes(storage.used)} of ${formatBytes(storage.cap)}
      <span class="meter"><span style="width: ${pct}%"></span></span>
    </span>`;
  }

  // The Book list's Volumes, with every other one on this computer unless
  // `treeOnly`; or why there are none.
  private rows(treeOnly: boolean): VolumesRow[] | string {
    const { view } = this;
    if (view === null) return 'Loading…';
    if (view === 'failed') return "The volumes couldn't be had from the app.";
    const rows = view.rows.filter((r) => !treeOnly || r.onList);
    if (rows.length > 0) return rows;
    if (!view.listed) {
      return "Astia couldn't be reached, and the volumes here aren't known yet.";
    }
    return 'No sources here cite a Volume yet. Add volumes to look through.';
  }

  private renderBody(rows: VolumesRow[] | string, shown: VolumesRow[]) {
    if (typeof rows === 'string') return renderEmpty(rows);
    if (shown.length === 0) {
      return renderEmpty(`No volume matches “${this.filter.trim()}”.`);
    }
    return renderBookTable({
      books: shown,
      shown: this.shownId(),
      acts: (b) =>
        renderActs(b, {
          ...this.does,
          busy: this.asking.busy,
          frees: this.frees
        }),
      open: (b) => {
        this.open(b.id, b.label);
      },
      menu: this.openMenu
    });
  }

  // What the table shows, and Storage's fill.
  private renderFoot(shown: VolumesRow[]) {
    if (shown.length === 0) return nothing;
    return html`<div class="foot">
      <p class="summary">${listSummary(shown)}</p>
      ${this.renderCache()}
    </div>`;
  }

  override render() {
    const offered = this.offered();
    const rows = this.rows(!offered || this.treeOnly);
    const shown =
      typeof rows === 'string'
        ? []
        : rows.filter((b) => matches(b, this.filter));
    return html`
      <div class="bar">
        ${this.renderModes()}
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
      ${this.renderBody(rows, shown)} ${this.renderFoot(shown)}
      ${renderRefused(this.asking.refused)} ${this.renderConfirm()}
      ${renderPagesMenu(this.pagesMenu, this.pagesActions(), () => {
        this.pagesMenu = null;
      })}
      ${this.renderPicker()}
    `;
  }

  // Asked before a Volume's Images leave this computer.
  private renderConfirm() {
    const { confirming } = this;
    if (confirming === null) return nothing;
    return renderLeaveDialog({
      book: confirming,
      confirm: () => {
        void this.removeVolume(confirming);
      },
      cancel: () => {
        this.confirming = null;
      }
    });
  }

  private renderPicker() {
    if (!this.picking) return nothing;
    return html`<sl-volume-picker
      @book-listed=${this.onListed}
      @open-volume=${(e: CustomEvent<VolumeOpen>) => {
        this.picking = false;
        this.open(e.detail.volumeId, e.detail.label);
      }}
      @close=${() => {
        this.picking = false;
      }}
    ></sl-volume-picker>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-volumes-list': VolumesListElement;
  }
}
