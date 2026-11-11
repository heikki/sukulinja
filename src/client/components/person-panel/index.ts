import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';

import { focusRingStyles } from '@/client/focus-ring';
import { appState } from '@/client/state';
import type {
  AppState,
  Chart,
  LinkOpen,
  LinkStatus,
  Source,
  SourceGroup
} from '@/client/state';
import type {
  ChurchBookArchive,
  CitationRow,
  Link,
  PhotoRow,
  RecordView
} from '@/common/types';

import { linkSpelling } from '../archive-search/api';
import { CROSS, formatName } from '../tree-view/renderer';

import '../archive-search';
import './fold';
import './header';

import { householdsOf, lifeText } from './family';
import type { Household, Relative } from './family';
import {
  archiveAction,
  factLabel,
  factText,
  headingOf,
  siteName,
  titleText
} from './helpers';
import { renderPhotos } from './photos';
import { personPanelStyles } from './styles';

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
// its scan in Astia, and what can be done of its archive.
function renderDetails(
  body: unknown,
  url: string | null,
  link: Link | null,
  archive: unknown
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
      ${archive}
    </div>
  `;
}

// Whether folding the source out shows anything: what it records, or a
// link to it.
function hasDetails(body: unknown, url: string | null, link: Link | null) {
  return body !== nothing || url !== null || link !== null;
}

// Each section open or not for the rest of the visit, across people; at
// first only the sources are.
const opened = {
  events: false,
  family: false,
  photos: false,
  sources: true
};
type Section = keyof typeof opened;

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

// Dates as the list writes them, the cross they end with a size up.
function crossed(life: string) {
  if (!life.endsWith(CROSS)) return life;
  return html`${life.slice(0, -CROSS.length)}<span class="cross"
      >${CROSS}</span
    >`;
}

// A relative's row selects them, and a double-click builds the chart
// around them.
function renderRelative(r: Relative, chart: Chart) {
  const life = lifeText(r.person);
  return html`<button
    class="relative"
    @click=${() => {
      chart.select(r.person.id);
    }}
    @dblclick=${() => {
      chart.makeRoot(r.person.id);
    }}
  >
    <span class="relation">${r.relation}</span>
    <span class="person">
      <span class="name">${formatName(r.person)}</span>
      ${life === '' ? nothing : html`<span class="life">${crossed(life)}</span>`}
    </span>
  </button>`;
}

// The Selected person's family, events, sources and Photos, beside the
// chart. A Photo opens in the Photo viewer.
// Record links open outside the app (the desktop shell
// hands target=_blank to the browser); a Link opens in the Scan viewer,
// and the source it shows is marked and brought into view.
@customElement('sl-person-panel')
class PersonPanelElement extends SignalWatcher(LitElement) {
  static override styles = [focusRingStyles, personPanelStyles];

  @consume({ context: appState }) private readonly state!: AppState;

  // Whether the dock holding the panel is open.
  @property({ type: Boolean }) docked = false;

  // The source shown in full; the others show only their heading and links.
  @state() private unfolded: number | null = null;

  // The source whose parish's archive is being looked for in Astia, while
  // its choice is saved, and why that failed.
  @state() private finding: number | null = null;
  @state() private linking = false;
  @state() private linkError: string | null = null;

  // Whose details are shown.
  private shownId: number | null = null;
  // The source last brought into view, and the one the viewer last showed
  // and for whom.
  private revealed: LinkOpen | null = null;
  private lastOpen: { source: LinkOpen | null; personId: number | null } = {
    source: null,
    personId: null
  };

  // The source the Scan viewer shows, unless it has moved off its Link.
  private get viewing() {
    const { viewer } = this.state;
    return viewer.away.get() ? null : viewer.source.get();
  }

  // Whether the sources can be seen: their section is open, and so is the
  // dock holding the panel.
  private sourcesShown() {
    return opened.sources && this.docked;
  }

  private detailsId() {
    return this.state.selected.details.get()?.id ?? null;
  }

  // A new person starts with every source folded, at the top. Waits for
  // their details rather than the selection, so the stale view doesn't jump
  // before it's replaced.
  override willUpdate() {
    if (this.detailsId() !== this.shownId) this.unfolded = null;
  }

  override updated() {
    const { viewer } = this.state;
    viewer.setSourcesInView(this.sourcesShown());
    const { viewing } = this;
    if (viewing !== this.revealed) {
      this.revealed = viewing;
      void this.revealViewing();
    }
    this.focusOnClose();
    const id = this.detailsId();
    if (id === this.shownId) return;
    this.shownId = id;
    this.scrollTop = 0;
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
    if (personId !== last.personId || !this.sourcesShown()) return;
    const title = this.renderRoot.querySelector(
      `[data-citation="${last.source.citation.id}"] button.title`
    );
    if (title instanceof HTMLElement) title.focus({ preventScroll: true });
  }

  // The source in the Scan viewer, scrolled to, opening Sources if need be
  // and once they've slid open.
  private async revealViewing() {
    const id = this.viewing?.citation.id;
    if (id === undefined) return;
    if (!opened.sources) {
      opened.sources = true;
      this.requestUpdate();
      await this.updateComplete;
      await this.renderRoot
        .querySelector('[data-section="sources"]')
        ?.querySelector('sl-fold')
        ?.settled();
    }
    const source = this.renderRoot.querySelector(`[data-citation="${id}"]`);
    source?.scrollIntoView({ block: 'nearest' });
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
  private actionOf(
    c: CitationRow,
    status: LinkStatus | null,
    foldable: boolean
  ) {
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
    if (!foldable) return null;
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
  // hides what it records, as its chevron does for both. Its record shows
  // only when selected, and opening it in the Scan viewer leaves it as it is.

  private renderCitation({ citation: c, status }: Source) {
    const { viewing, elsewhere } = this.markOf(c);
    const heading = headingOf(c);
    const body = renderBody(c, heading);
    const link = status?.link ?? null;
    const filed = isFiled(status);
    const foldable = hasDetails(body, c.url, link);
    const open = this.unfolded === c.id && foldable;
    const act = this.actionOf(c, status, foldable);
    return html`
      <article
        class=${sourceClass({
          active: act !== null,
          viewing,
          elsewhere,
          linked: filed
        })}
        data-citation=${c.id}
        @click=${(e: Event) => {
          const on = e.target as Element;
          if (on.closest('a, .fold, .record') === null) act?.();
        }}
      >
        <div class="top">
          <div class="lines">
            <button
              class="title"
              ?disabled=${act === null}
              aria-current=${viewing ? 'true' : nothing}
            >
              ${titleText(c, status)}
            </button>
            ${renderStatus(status, filedEntry(c, filed))}
          </div>
          ${
            foldable
              ? renderFold(open, () => {
                  this.fold(c.id);
                })
              : nothing
          }
        </div>
        ${
          foldable
            ? html`<sl-fold .open=${open}>
                ${renderDetails(body, c.url, link, this.renderArchive(c, status))}
              </sl-fold>`
            : nothing
        }
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

  private renderFamily(households: Household[]) {
    return households.map(
      (h) => html`
        <div class="family">
          ${h.map((r) => renderRelative(r, this.state.chart))}
        </div>
      `
    );
  }

  // Clicked again while the Photo viewer shows it, it closes the viewer.
  private renderPhotos(photos: PhotoRow[]) {
    const { photoViewer, chart, api } = this.state;
    const shown = photoViewer.opened.get()?.id ?? null;
    return renderPhotos(photos, shown, {
      url: api.mediaUrl,
      open: (p) => {
        if (p.id === shown) photoViewer.close();
        else chart.openPhoto(p);
      }
    });
  }

  private renderSources() {
    const groups = this.state.selected.sources.get();
    return groups.map((g) => this.renderGroup(g));
  }

  // A heading that shows or hides what follows it.
  private renderSection(
    section: Section,
    label: string,
    content: () => unknown
  ) {
    const open = opened[section];
    return html`
      <section data-section=${section}>
        <h3>
          <button
            class="toggle"
            aria-expanded=${open ? 'true' : 'false'}
            @click=${() => {
              opened[section] = !open;
              this.requestUpdate();
            }}
          >
            ${label}
          </button>
        </h3>
        <sl-fold .open=${open}>
          <div class="section-body">${content()}</div>
        </sl-fold>
      </section>
    `;
  }

  override render() {
    const { selected } = this.state;
    const error = selected.error.get();
    if (error !== null) {
      return html`<div class="body muted">Couldn't load: ${error}</div>`;
    }
    const d = selected.details.get();
    if (d === null) return html`<div class="body muted">Loading…</div>`;
    const stale = d.id !== selected.id.get();
    const households = householdsOf(d.id, this.state.chart.people.get());
    return html`
      <div class="body ${stale ? 'stale' : ''}">
        ${
          households.length === 0
            ? nothing
            : this.renderSection('family', 'Family', () =>
                this.renderFamily(households)
              )
        }
        ${
          d.facts.length === 0
            ? nothing
            : this.renderSection(
                'events',
                'Events',
                () =>
                  html`<dl>
                    ${d.facts.map(
                      (f) =>
                        html`<dt>${factLabel(f)}</dt>
                          <dd>${factText(f)}</dd>`
                    )}
                  </dl>`
              )
        }
        ${
          d.citations.length === 0
            ? nothing
            : this.renderSection('sources', 'Sources', () =>
                this.renderSources()
              )
        }
        ${
          d.photos.length === 0
            ? nothing
            : this.renderSection('photos', 'Photos', () =>
                this.renderPhotos(d.photos)
              )
        }
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-person-panel': PersonPanelElement;
  }
}
