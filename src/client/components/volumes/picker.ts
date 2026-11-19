import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { html, LitElement, nothing } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';

import { Asking } from '@/client/asking';
import { focusRingStyles } from '@/client/focus-ring';
import { appState } from '@/client/state';
import type { AppState } from '@/client/state';
import type {
  BookKind,
  BookSuggestion,
  ChurchBookArchive,
  ChurchBookVolume,
  ListedBook,
  SuggestedVolume
} from '@/common/types';

import { fitLines } from './fits';
import type { FitLine } from './fits';
import {
  bySeries,
  matches,
  othersOf,
  SERIES,
  seriesName,
  volumeCode,
  yearsText
} from './helpers';
import { volumePickerStyles } from './picker-styles';

import '../archive-search';

export type BookListEvent = CustomEvent<ListedBook[]>;

// A Volume to open in the Scan viewer.
export interface VolumeOpen {
  volumeId: string;
  label: string;
}

// The Volume picker, a modal over the window: the parishes down its side,
// the dataset's own first, then the install's others and finding another
// in Astia; on top, the Volumes that fit the Selected person, each of
// their Expected entries with the Volumes it fits; then the parish's
// Volumes by series, which a series or a year narrows. A Volume not on
// the Book list (`listed`) is added to it, which says the list as it now
// is (`book-listed`); any can be opened (`open-volume`). A parish picked
// scrolls its Volumes to the top. Esc, the close button or a press outside
// asks to `close`.
@customElement('sl-volume-picker')
class VolumePickerElement extends SignalWatcher(LitElement) {
  static override styles = [focusRingStyles, volumePickerStyles];

  // The Volumes on the Book list, by id.
  @property({ attribute: false }) listed = new Set<string>();

  @query('dialog') private readonly dialog!: HTMLDialogElement;
  @query('section.parish') private readonly parishSection!: HTMLElement | null;

  // A parish picked from the side: its Volumes scroll to the top once
  // they're shown, past what fits the Selected person.
  private scrollToParish = false;

  @consume({ context: appState }) private readonly state!: AppState;

  @state() private own: ChurchBookArchive[] | 'failed' | null = null;
  @state() private others: ChurchBookArchive[] = [];
  @state() private parish: ChurchBookArchive | null = null;
  @state() private volumes: ChurchBookVolume[] | 'failed' | null = null;
  @state() private kind: BookKind | null = null;
  @state() private year = '';
  @state() private finding = false;

  // The Selected person's, by their id; null until known, and if they
  // can't be.
  @state() private fits: { personId: number; lines: FitLine[] } | null = null;

  // Adding a Volume to the list, or a parish found in Astia; why that was
  // refused.
  private readonly adding = new Asking(this);

  override connectedCallback() {
    super.connectedCallback();
    void this.loadParishes();
  }

  override firstUpdated() {
    this.dialog.showModal();
  }

  override updated() {
    if (!this.scrollToParish || this.volumes === null) return;
    this.scrollToParish = false;
    this.parishSection?.scrollIntoView({ block: 'start' });
  }

  override willUpdate() {
    const id = this.state.selected.id.get();
    if (id !== null && this.fits?.personId !== id) void this.loadFits(id);
    if (id === null && this.fits !== null) this.fits = null;
  }

  private async loadFits(personId: number) {
    this.fits = { personId, lines: [] };
    const found: BookSuggestion[] = await this.state.api
      .personBooks(personId)
      .catch(() => []);
    if (this.fits.personId === personId) {
      this.fits = { personId, lines: fitLines(found) };
    }
  }

  // The dataset's archives, then the install's others; the first opens.
  private async loadParishes(open: ChurchBookArchive | null = null) {
    const [own, all] = await Promise.all([
      this.state.api.archives().catch(() => 'failed' as const),
      this.state.app.parishes().catch(() => [])
    ]);
    this.own = own;
    this.others = own === 'failed' ? all : othersOf(own, all);
    const first = (own === 'failed' ? [] : own)[0] ?? this.others[0] ?? null;
    this.pick(open ?? this.parish ?? first);
  }

  private pick(parish: ChurchBookArchive | null) {
    if (parish?.archiveId === this.parish?.archiveId && this.volumes !== null) {
      return;
    }
    this.parish = parish;
    this.volumes = null;
    if (parish !== null) void this.loadVolumes(parish);
  }

  private async loadVolumes(parish: ChurchBookArchive) {
    const volumes = await this.state.app
      .churchBooks(parish.archiveId)
      .catch(() => 'failed' as const);
    if (this.parish === parish) this.volumes = volumes;
  }

  private async addFound(archive: ChurchBookArchive) {
    await this.adding.run(async () => {
      await this.state.app.addParish(archive.archiveId);
      this.finding = false;
      await this.loadParishes(archive);
    });
  }

  private async list(volumeId: string, archiveId: string) {
    await this.adding.run(async () => {
      const books = await this.state.api.listBook({ volumeId, archiveId });
      this.dispatchEvent(new CustomEvent('book-listed', { detail: books }));
    });
  }

  private open(volumeId: string, label: string) {
    this.dispatchEvent(
      new CustomEvent('open-volume', { detail: { volumeId, label } })
    );
  }

  private close() {
    this.dispatchEvent(new CustomEvent('close'));
  }

  // Esc closes the picker alone, not the corner panel it opened from.
  // Marked handled, or WKWebView hands it on to macOS, which beeps.
  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    this.close();
  };

  // A press on the backdrop is a press on the dialog itself.
  private readonly onClick = (e: MouseEvent) => {
    if (e.target === this.dialog) this.close();
  };

  private renderAdd(volumeId: string, archiveId: string, label: string) {
    if (this.listed.has(volumeId)) return html`<span class="on">On list</span>`;
    return html`<button
      class="ghost"
      aria-label="Add ${label}"
      ?disabled=${this.adding.busy}
      @click=${() => {
        void this.list(volumeId, archiveId);
      }}
    >
      Add
    </button>`;
  }

  private renderSuggested(v: SuggestedVolume, kind: BookKind) {
    return html`<span class="row">
      <span class="name">
        ${volumeCode(v.label)} ${seriesName(kind)}
        <span class="muted">${yearsText(v.years)}</span>
        ${v.near ? nothing : html`<span class="muted">· ${v.parish}</span>`}
      </span>
      <button
        class="ghost"
        aria-label="Open ${v.label}"
        @click=${() => {
          this.open(v.id, v.label);
        }}
      >
        Open
      </button>
      ${this.renderAdd(v.id, v.archiveId, v.label)}
    </span>`;
  }

  private renderFits() {
    const { fits } = this;
    if (fits === null) return nothing;
    const name =
      this.state.selected.details.get()?.name ?? 'the Selected person';
    return html`<section class="fits" aria-label="Fits ${name}">
      <h3>Fits ${name}</h3>
      ${
        fits.lines.length === 0
          ? html`<span class="muted">Nothing their Facts date.</span>`
          : fits.lines.map(
              (line) =>
                html`<div class="fit">
                  <span class="why">${line.why}</span>
                  <div>
                    ${
                      line.none === null
                        ? line.suggestion.volumes.map((v) =>
                            this.renderSuggested(
                              v,
                              line.suggestion.expected.kind
                            )
                          )
                        : html`<span class="muted">${line.none}</span>`
                    }
                  </div>
                </div>`
            )
      }
    </section>`;
  }

  private renderParishButton(p: ChurchBookArchive) {
    return html`<button
      class="parish"
      aria-current=${p.archiveId === this.parish?.archiveId ? 'true' : 'false'}
      @click=${() => {
        this.scrollToParish = true;
        this.pick(p);
        this.requestUpdate();
      }}
    >
      ${p.title}
    </button>`;
  }

  private renderParishes() {
    const own = Array.isArray(this.own) ? this.own : [];
    return html`<aside aria-label="Parishes">
      ${
        own.length === 0
          ? nothing
          : html`<h3>This tree's</h3>
              ${own.map((p) => this.renderParishButton(p))}`
      }
      ${
        this.others.length === 0
          ? nothing
          : html`<h3>Other parishes</h3>
              ${this.others.map((p) => this.renderParishButton(p))}`
      }
      ${
        this.finding
          ? html`<sl-archive-search
              label="Parish in Astia"
              ?busy=${this.adding.busy}
              .error=${this.adding.refused}
              @archive-chosen=${(e: CustomEvent<ChurchBookArchive>) => {
                void this.addFound(e.detail);
              }}
              @cancel=${() => {
                this.finding = false;
              }}
            ></sl-archive-search>`
          : html`<button
              class="find"
              @click=${() => {
                this.finding = true;
                this.adding.forget();
              }}
            >
              + Find a parish in Astia
            </button>`
      }
    </aside>`;
  }

  private renderFilters() {
    return html`<div class="filters">
      <span class="title">${this.parish?.title}</span>
      ${[{ kind: null, name: 'All series' }, ...SERIES].map(
        (s) =>
          html`<button
            class="chip"
            aria-pressed=${this.kind === s.kind ? 'true' : 'false'}
            @click=${() => {
              this.kind = s.kind;
            }}
          >
            ${s.name}
          </button>`
      )}
      <label
        >Year
        <input
          inputmode="numeric"
          .value=${this.year}
          @input=${(e: InputEvent) => {
            this.year = (e.target as HTMLInputElement).value;
          }}
      /></label>
    </div>`;
  }

  private renderVolume(v: ChurchBookVolume, archiveId: string) {
    return html`<div class="row">
      <span class="name ${v.digitized ? '' : 'muted'}">
        ${volumeCode(v.label)}
        <span class="muted">${yearsText(v.years)}</span>
      </span>
      ${
        v.digitized
          ? html`<button
                class="ghost"
                aria-label="Open ${v.label}"
                @click=${() => {
                  this.open(v.id, v.label);
                }}
              >
                Open
              </button>
              ${this.renderAdd(v.id, archiveId, v.label)}`
          : html`<span class="on">Not digitized</span>`
      }
    </div>`;
  }

  private renderVolumes() {
    const { volumes, parish } = this;
    if (parish === null) {
      return html`<p class="muted">Find a parish in Astia to begin.</p>`;
    }
    if (volumes === null) {
      return html`<p class="muted">Asking Astia for the volumes…</p>`;
    }
    if (volumes === 'failed') {
      return html`<p class="muted">
        Astia couldn't be reached, and its volumes here aren't known yet.
      </p>`;
    }
    const shown = volumes
      .filter((v) => this.kind === null || v.kind === this.kind)
      .filter((v) =>
        /^\d{4}$/u.test(this.year.trim()) ? matches(v, this.year) : true
      )
      .toSorted(bySeries);
    if (shown.length === 0) {
      return html`<p class="muted">No volume here matches.</p>`;
    }
    const groups = [...SERIES.map((s) => s.kind), null].flatMap((kind) => {
      const of = shown.filter((v) => v.kind === kind);
      return of.length === 0 ? [] : [{ kind, of }];
    });
    return html`<div class="grid">
      ${groups.map(
        (g) =>
          html`<div class="series">
            <h3>${g.kind === null ? 'Other' : seriesName(g.kind)}</h3>
            ${g.of.map((v) => this.renderVolume(v, parish.archiveId))}
          </div>`
      )}
    </div>`;
  }

  override render() {
    return html`<dialog
      aria-label="Add volumes"
      @keydown=${this.onKeyDown}
      @click=${this.onClick}
      @cancel=${(e: Event) => {
        e.preventDefault();
        this.close();
      }}
    >
      <div class="frame">
        <header>
          <div>
            <h2>Add volumes</h2>
            <p>to this tree's list, or open one straight away</p>
          </div>
          <button
            class="ghost"
            aria-label="Close"
            @click=${() => {
              this.close();
            }}
          >
            Close
          </button>
        </header>
        <div class="body">
          ${this.renderParishes()}
          <main>
            ${this.renderFits()}
            ${
              this.adding.refused === null || this.finding
                ? nothing
                : html`<p class="refused">${this.adding.refused}</p>`
            }
            <section
              class="parish"
              aria-label=${this.parish?.title ?? 'Parish'}
            >
              ${this.renderFilters()} ${this.renderVolumes()}
            </section>
          </main>
        </div>
      </div>
    </dialog>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-volume-picker': VolumePickerElement;
  }
}
