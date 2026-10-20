import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';

import { focusRingStyles } from '@client/focus-ring';
import { volumeTitle } from '@client/link-labels';
import { appState } from '@client/state';
import type {
  AppState,
  LinkOpen,
  LinkStatus,
  Source,
  SourceGroup
} from '@client/state';
import { BOOK_NAMES } from '@common/books';
import type { CitationRow, Link, RecordView } from '@common/types';

import { CROSS, formatName } from '../tree-view/renderer';

import './fold';
import './header';

import { householdsOf, lifeText } from './family';
import type { FamilyIndices, Household, Relative } from './family';
import { factLabel, factText, siteName } from './helpers';
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
    title=${label}
    @click=${fold}
  ></button>`;
}

// Where in its Volume the reference points, if it links one, and how.
function renderStatus(status: LinkStatus | null, entry: string | null) {
  if (status === null) return nothing;
  return html`<div class="status">
    ${entry === null ? nothing : html`<span class="entry">${entry}</span>`}
    <span class="chip" title=${status.title}>${status.label}</span>
  </div>`;
}

function renderSite(href: string, label: string) {
  return html`<a href=${href} target="_blank" rel="noopener">${label} ↗</a>`;
}

// What the source records, then links to the record on its own site and to
// its scan in Astia.
function renderDetails(body: unknown, url: string | null, link: Link | null) {
  const astia = link === null || link.url === '' ? null : link.url;
  const links = [
    url === null ? null : renderSite(url, `Open on ${siteName(url)}`),
    astia === null ? null : renderSite(astia, 'Open in Astia')
  ].filter((l) => l !== null);
  return html`
    <div class="record">
      ${body}
      ${links.length === 0 ? nothing : html`<div class="sites">${links}</div>`}
    </div>
  `;
}

// Whether folding the source out shows anything: what it records, or a
// link to it.
function hasDetails(body: unknown, url: string | null, link: Link | null) {
  return body !== nothing || url !== null || link !== null;
}

// A Church-book reference names itself; other sources go by their title,
// or failing that what they say.
function headingOf(c: CitationRow) {
  return c.reference ?? c.source ?? c.text ?? c.page ?? 'Source';
}

// Each section open or not for the rest of the visit, across people; at
// first only the sources are.
const opened = { events: false, family: false, sources: true };
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

// A source clicking opens (`active`), the one the Scan viewer shows
// (`viewing`), and one filed under its archive, titled by its Volume or
// Book (`linked`).
function sourceClass(flags: Record<string, boolean>) {
  const on = Object.entries(flags).filter(([, v]) => v);
  return ['source', ...on.map(([k]) => k)].join(' ');
}

// Under its archive, a Church-book reference goes by the Volume it links,
// named as Astia names it but for its code: "Pää- ja rippikirjat
// (1783-1790)"; one the archive's books lack goes by its Book.
function titleText(c: CitationRow, status: LinkStatus | null) {
  const link = status?.link ?? null;
  if (link !== null) return volumeTitle(link.volume);
  const kind = c.cited?.kind ?? null;
  if ((status?.browse ?? null) === null || kind === null) return headingOf(c);
  return BOOK_NAMES[kind];
}

// A Church-book reference's tooltip names its collection.
function titleOf(c: CitationRow, heading: string) {
  return c.reference === null ? heading : (c.source ?? heading);
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

// A relative's row picks them, and a double-click centers the chart on them.
function renderRelative(r: Relative, ask: (event: string, id: number) => void) {
  const life = lifeText(r.person);
  return html`<button
    class="relative"
    @click=${() => {
      ask('pick', r.person.id);
    }}
    @dblclick=${() => {
      ask('center', r.person.id);
    }}
  >
    <span class="relation">${r.relation}</span>
    <span class="person">
      <span class="name">${formatName(r.person)}</span>
      ${life === '' ? nothing : html`<span class="life">${crossed(life)}</span>`}
    </span>
  </button>`;
}

// The Selected person's family, events and sources, beside the chart. A
// relative's row asks for them with `pick`, and for the chart built around
// them with `center`. Record links open outside the app (the desktop shell
// hands target=_blank to the browser); a Link opens in the Scan viewer,
// and the source it shows is marked and brought into view.
@customElement('sl-person-panel')
export class PersonPanelElement extends SignalWatcher(LitElement) {
  static override styles = [focusRingStyles, personPanelStyles];

  @consume({ context: appState }) private readonly state!: AppState;

  // The chart's persons and families, which name the person's households.
  @property({ attribute: false }) indices: FamilyIndices | null = null;
  // Whether the dock holding the panel is open.
  @property({ type: Boolean }) docked = false;

  // The source shown in full; the others show only their heading and links.
  @state() private unfolded: number | null = null;

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

  // What clicking the source does: open its scan if it is a church book
  // that has one, or the viewer to look through its parish's Volumes if it
  // can; else show or hide its record. The viewer goes back to the Link
  // even when it's showing this source already.
  private actionOf(
    c: CitationRow,
    status: LinkStatus | null,
    foldable: boolean
  ) {
    const link = status?.link ?? null;
    if (link !== null) {
      return () => {
        this.state.viewer.open({ citation: c, link });
      };
    }
    const unlinked = status?.browse ?? null;
    if (unlinked !== null) {
      return () => {
        this.state.viewer.open({ citation: c, link: null, unlinked });
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

  // Clicking a church-book source opens its scan; clicking another shows or
  // hides what it records, as its chevron does for both. Its record shows
  // only when selected, and opening it in the Scan viewer leaves it as it is.
  private renderCitation({ citation: c, status }: Source) {
    const viewing = this.viewing?.citation.id === c.id;
    const heading = headingOf(c);
    const body = renderBody(c, heading);
    const link = status?.link ?? null;
    const filed = isFiled(status);
    const foldable = hasDetails(body, c.url, link);
    const open = this.unfolded === c.id && foldable;
    const act = this.actionOf(c, status, foldable);
    return html`
      <article
        class=${sourceClass({ active: act !== null, viewing, linked: filed })}
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
              title=${link === null ? titleOf(c, heading) : link.volume}
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
                ${renderDetails(body, c.url, link)}
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

  private readonly ask = (event: string, id: number) => {
    this.dispatchEvent(new CustomEvent(event, { detail: { id } }));
  };

  private renderFamily(households: Household[]) {
    return households.map(
      (h) => html`
        <div class="family">${h.map((r) => renderRelative(r, this.ask))}</div>
      `
    );
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
    const households =
      this.indices === null ? [] : householdsOf(d.id, this.indices);
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
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-person-panel': PersonPanelElement;
  }
}
