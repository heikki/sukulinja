import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';

import { ApiError } from '@/client/dataset-api';
import { focusRingStyles } from '@/client/focus-ring';
import { formStyles } from '@/client/form-styles';
import { appState } from '@/client/state';
import type {
  AppState,
  LinkOpen,
  LinkStatus,
  Source,
  SourceGroup
} from '@/client/state';
import type {
  ChurchBookArchive,
  CitationRow,
  Link,
  RecordView
} from '@/common/types';

import { linkSpelling } from '../archive-search/api';

import '../archive-search';
import './fold';
import './suggestions';
import './supports';

import {
  archiveAction,
  headingOf,
  openSuggestions,
  siteName,
  titleText
} from './helpers';
import { personSourcesStyles } from './sources-styles';
import { definitionListStyles } from './styles';

function renderRecord(r: RecordView) {
  return html`
    <div class="who">${r.name}</div>
    <dl>
      ${r.fields.map(
        (f) =>
          html`<dt>${f.label}</dt>
            <dd>${f.value}</dd>`
      )}
    </dl>
    ${
      r.household.length === 0
        ? nothing
        : html`
            <div class="household">Household · ${r.household.length}</div>
            <table>
              ${r.household.map(
                (m) => html`
                  <tr>
                    <td>${m.relation ?? ''}</td>
                    <td>${m.name}</td>
                    <td>${m.born ?? ''}</td>
                  </tr>
                `
              )}
            </table>
          `
    }
  `;
}

function renderFold(open: boolean, fold: () => void) {
  const label = open ? 'Hide the record' : 'Show the record';
  return html`<button
    class="fold"
    aria-expanded=${open ? 'true' : 'false'}
    aria-label=${label}
    @click=${fold}
  ></button>`;
}

// Where in its Volume the reference points, if it links one, and how. The
// chip carries its Link's Certainty, for the styles to tint.
function renderStatus(status: LinkStatus | null, entry: string | null) {
  if (status === null) return nothing;
  return html`<div class="status">
    ${entry === null ? nothing : html`<span class="entry">${entry}</span>`}
    <span class="chip" data-certainty=${status.link?.certainty ?? nothing}
      >${status.label}</span
    >
  </div>`;
}

function renderSite(href: string, label: string) {
  return html`<a href=${href} target="_blank" rel="noopener">${label} ↗</a>`;
}

// What the source records, then links to the record on its own site and to
// its scan in Astia, and what can be done: of its archive, and deleting it.
function renderDetails(
  body: unknown,
  url: string | null,
  link: Link | null,
  actions: unknown
) {
  const astia = link === null || link.url === '' ? null : link.url;
  // A Citation of an Astia Image is at its Link's own address.
  const own = url === null || url === astia ? null : url;
  const links = [
    own === null ? null : renderSite(own, `Open on ${siteName(own)}`),
    astia === null ? null : renderSite(astia, 'Open in Astia')
  ].filter((l) => l !== null);
  return html`
    <div class="record">
      ${body}
      ${links.length === 0 ? nothing : html`<div class="sites">${links}</div>`}
      ${actions}
    </div>
  `;
}

// Filed under its archive: it links a Volume there, or the archive's
// books were looked through for it.
function isFiled(status: LinkStatus | null) {
  return status !== null && (status.link !== null || status.browse !== null);
}

// Under its archive (`filed`), where in its Volume the reference points.
function filedEntry(c: CitationRow, filed: boolean) {
  return filed ? c.entry : null;
}

// Whether a source's Link is to an Image of its Volume, so the viewer
// shows its own.
function hasImage(source: { link: Link | null }) {
  return source.link !== null && source.link.precision !== 'volume';
}

// A source clicking opens (`active`), the one the Scan viewer shows on its
// Image (`viewing`), the one it's open on otherwise (`elsewhere`), and one
// filed under its archive, titled by its Volume or Book (`linked`).
function sourceClass(flags: Record<string, boolean>) {
  const on = Object.entries(flags).filter(([, v]) => v);
  return ['source', ...on.map(([k]) => k)].join(' ');
}

function renderBody(c: CitationRow, heading: string) {
  if (c.record !== null) return renderRecord(c.record);
  const text = c.text ?? c.page;
  return text === null || text === heading
    ? nothing
    : html`<p class="text">${text}</p>`;
}

// The Selected person's sources, in their groups. A church-book source
// opens its scan in the Scan viewer, which marks the source it shows;
// another shows or hides what it records. Record links open outside the
// app (the desktop shell hands target=_blank to the browser).
@customElement('sl-person-sources')
class PersonSourcesElement extends SignalWatcher(LitElement) {
  static override styles = [
    focusRingStyles,
    definitionListStyles,
    formStyles,
    personSourcesStyles
  ];

  @consume({ context: appState }) private readonly state!: AppState;

  // Whether the sources can be seen: their section is open, and so is the
  // dock holding the panel.
  @property({ type: Boolean }) shown = false;

  // The source shown in full; the others show only their heading and links.
  @state() private unfolded: number | null = null;

  // The source whose parish's archive is being looked for in Astia, while
  // its choice is saved, and why that failed.
  @state() private finding: number | null = null;
  @state() private linking = false;
  @state() private linkError: string | null = null;

  // The source asked about deleting, while it's deleted, and why that
  // failed.
  @state() private asking: number | null = null;
  @state() private deleting = false;
  @state() private deleteError: string | null = null;

  // Whose sources are shown, and the source the viewer last showed and
  // for whom.
  private shownId: number | null = null;
  private lastOpen: { source: LinkOpen | null; personId: number | null } = {
    source: null,
    personId: null
  };

  // The source the Scan viewer shows, unless it has moved off its Link.
  private get viewing() {
    const { viewer } = this.state;
    return viewer.away.get() ? null : viewer.source.get();
  }

  // A new person starts with every source folded. Waits for their details
  // rather than the selection, so the stale view doesn't jump before it's
  // replaced.
  override willUpdate() {
    const id = this.state.selected.details.get()?.id ?? null;
    if (id === this.shownId) return;
    this.shownId = id;
    this.unfolded = null;
    this.ask(null);
  }

  override updated() {
    this.focusOnClose();
  }

  // Scrolls the source into view.
  async reveal(citationId: number) {
    await this.updateComplete;
    this.renderRoot
      .querySelector(`[data-citation="${citationId}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }

  // Unfolds the source and scrolls it into view, as picking it from a Fact
  // does.
  async show(citationId: number) {
    this.unfolded = citationId;
    await this.reveal(citationId);
  }

  // The Scan viewer closing hands focus back to the source it showed, where
  // that can be seen. Not when it closed for someone else being selected:
  // focus stays where that was done.
  private focusOnClose() {
    const source = this.state.viewer.source.get();
    const personId = this.state.selected.id.get();
    const last = this.lastOpen;
    this.lastOpen = { source, personId };
    if (last.source === null || source !== null) return;
    if (personId !== last.personId || !this.shown) return;
    const title = this.renderRoot.querySelector(
      `[data-citation="${last.source.citation.id}"] button.title`
    );
    if (title instanceof HTMLElement) title.focus({ preventScroll: true });
  }

  // Whether the viewer is open on the source and not away from its Link.
  private showing(c: CitationRow) {
    const { viewer } = this.state;
    return viewer.source.get()?.citation.id === c.id && !viewer.away.get();
  }

  // What clicking the source does: open its scan if it is a church book
  // that has one, or the viewer to look through its parish's Volumes if it
  // can; else show or hide its record. Clicked again while the viewer
  // shows its Link, it closes the viewer; away from the Link, it goes back.
  private actionOf(c: CitationRow, status: LinkStatus | null) {
    const link = status?.link ?? null;
    if (link !== null) {
      return () => {
        if (this.showing(c)) this.state.viewer.close();
        else this.state.viewer.open({ citation: c, link });
      };
    }
    const unlinked = status?.browse ?? null;
    if (unlinked !== null) {
      return () => {
        if (this.showing(c)) this.state.viewer.close();
        else this.state.viewer.open({ citation: c, link: null, unlinked });
      };
    }
    return () => {
      this.fold(c.id);
    };
  }

  private fold(id: number) {
    this.unfolded = this.unfolded === id ? null : id;
  }

  private find(id: number | null) {
    this.finding = id;
    this.linkError = null;
  }

  // Every source giving the parish's spelling links into the archive from
  // now on; the person's Links are resolved again.
  private async link(spelling: string, archive: ChurchBookArchive) {
    this.linking = true;
    this.linkError = null;
    try {
      await linkSpelling(spelling, archive.archiveId);
      this.finding = null;
      await this.state.selected.refresh();
    } catch (err) {
      this.linkError = err instanceof Error ? err.message : String(err);
    } finally {
      this.linking = false;
    }
  }

  private ask(id: number | null) {
    this.asking = id;
    this.deleteError = null;
  }

  // The Citation deleted (ADR-0021), and the Scan viewer closed if it
  // shows it.
  private async deleteCitation(c: CitationRow) {
    if (this.deleting) return;
    this.deleting = true;
    this.deleteError = null;
    try {
      await this.state.selected.uncite(c.id);
      const { viewer } = this.state;
      if (viewer.source.get()?.citation.id === c.id) viewer.close();
      this.asking = null;
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      this.deleteError = err.message;
    } finally {
      this.deleting = false;
    }
  }

  // Deleting the source's Citation, asked first.
  private renderDelete(c: CitationRow) {
    // Kept from the source's own click, which would find the button gone
    // once the question replaces it, and fold the source.
    if (this.asking !== c.id) {
      return html`<button
        class="delete"
        @click=${(e: Event) => {
          e.stopPropagation();
          this.ask(c.id);
        }}
      >
        Delete citation
      </button>`;
    }
    return html`<div
      class="form asking"
      @click=${(e: Event) => {
        e.stopPropagation();
      }}
    >
      <p>Delete this citation?</p>
      ${
        this.deleteError === null
          ? nothing
          : html`<p class="error">${this.deleteError}</p>`
      }
      <div class="buttons end">
        <button
          ?disabled=${this.deleting}
          @click=${() => {
            this.ask(null);
          }}
        >
          Cancel
        </button>
        <button
          class="danger"
          ?disabled=${this.deleting}
          @click=${() => {
            void this.deleteCitation(c);
          }}
        >
          ${this.deleting ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </div>`;
  }

  // How many of the person's Facts the Citation's Transcription suggests it
  // supports, seen without unfolding it.
  private renderSuggested(c: CitationRow) {
    const facts = this.state.selected.details.get()?.facts ?? [];
    const n = openSuggestions(c, facts).length;
    if (n === 0) return nothing;
    return html`<div class="suggested">
      ${n === 1 ? 'Suggests a Fact' : `Suggests ${n} Facts`}
    </div>`;
  }

  // The person's Facts the Citation supports, to choose from.
  private renderSupports(c: CitationRow) {
    const facts = this.state.selected.details.get()?.facts ?? [];
    return html`<sl-citation-supports
      .citation=${c}
      .facts=${facts}
    ></sl-citation-supports>`;
  }

  // Finding the reference's parish's archive in Astia where none is known,
  // or changing the one it links into: for every source giving the same
  // spelling.
  private renderArchive(c: CitationRow, status: LinkStatus | null) {
    const action = archiveAction(c, status);
    const spelling = c.cited?.parish ?? null;
    if (action === null || spelling === null) return nothing;
    if (this.finding !== c.id) {
      // Kept from the source's own click, as the search replacing it has
      // already left the source by then.
      return html`<button
        class="archive"
        @click=${(e: Event) => {
          e.stopPropagation();
          this.find(c.id);
        }}
      >
        ${action === 'find' ? 'Find archive in Astia' : 'Change archive'}
      </button>`;
    }
    // A click in the search isn't the source's: Cancel would fold it.
    return html`<div
      class="finding"
      @click=${(e: Event) => {
        e.stopPropagation();
      }}
    >
      <p class="hint">
        Sources giving the parish as “${spelling}” will all link into the
        archive chosen.
      </p>
      <sl-archive-search
        .name=${spelling}
        label="Parish's archive in Astia"
        ?busy=${this.linking}
        .error=${this.linkError}
        @archive-chosen=${(e: CustomEvent<ChurchBookArchive>) => {
          void this.link(spelling, e.detail);
        }}
        @cancel=${() => {
          this.find(null);
        }}
      ></sl-archive-search>
    </div>`;
  }

  // Whether the source is the one the Scan viewer shows on its Image, or
  // one it's open on elsewhere: moved off its Image, or with none to show,
  // its Link only to the Volume or none at all. Marked in full as shown
  // while the menu's item placing it is pointed at.
  private markOf(c: CitationRow) {
    const { viewer } = this.state;
    const { viewing: on } = this;
    const shown = on?.citation.id === c.id && hasImage(on);
    const open = !shown && viewer.source.get()?.citation.id === c.id;
    const viewing = shown || (open && viewer.placing.get());
    return { viewing, elsewhere: open && !viewing };
  }

  // Clicking a church-book source opens its scan; clicking another shows or
  // hides its details, as its chevron does for both: what it records, its
  // links and what can be done of it. Its details show only when selected,
  // and opening it in the Scan viewer leaves them as they are.

  private renderCitation({ citation: c, status }: Source) {
    const { viewing, elsewhere } = this.markOf(c);
    const heading = headingOf(c);
    const body = renderBody(c, heading);
    const link = status?.link ?? null;
    const filed = isFiled(status);
    const open = this.unfolded === c.id;
    const act = this.actionOf(c, status);
    return html`
      <article
        class=${sourceClass({
          active: true,
          viewing,
          elsewhere,
          linked: filed
        })}
        data-citation=${c.id}
        @click=${(e: Event) => {
          const on = e.target as Element;
          if (on.closest('a, .fold, .record') === null) act();
        }}
      >
        <div class="top">
          <div class="lines">
            <button class="title" aria-current=${viewing ? 'true' : nothing}>
              ${titleText(c, status)}
            </button>
            ${renderStatus(status, filedEntry(c, filed))}
            ${this.renderSuggested(c)}
          </div>
          ${renderFold(open, () => {
            this.fold(c.id);
          })}
        </div>
        <sl-fold .open=${open}>
          ${renderDetails(
            body,
            c.url,
            link,
            html`${this.renderSupports(c)} ${this.renderArchive(c, status)}
            ${this.renderDelete(c)}`
          )}
        </sl-fold>
      </article>
    `;
  }

  // Each source keeps its own element, so another person's sources or a
  // reordering never slides one shut that was open.
  private renderGroup(g: SourceGroup) {
    return html`
      ${g.label === null ? nothing : html`<h4>${g.label}</h4>`}
      ${repeat(
        g.sources,
        (source) => source.citation.id,
        (source) => this.renderCitation(source)
      )}
    `;
  }

  override render() {
    const groups = this.state.selected.sources.get();
    return html`<sl-confirm-suggestions></sl-confirm-suggestions>
      ${groups.map((g) => this.renderGroup(g))}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-person-sources': PersonSourcesElement;
  }
}
