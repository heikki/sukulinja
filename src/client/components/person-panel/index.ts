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
import type { CitationRow, Link, RecordView, Reminder } from '@/common/types';

import { ReminderActions } from '../reminder-dialog/actions';
import { CROSS, formatName } from '../tree-view/renderer';

import './fold';
import './header';

import { householdsOf, lifeText } from './family';
import type { Household, Relative } from './family';
import { factLabel, factText, headingOf, siteName, titleText } from './helpers';
import { personReminders, renderReminders } from './reminders';
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

// Where in its Volume the reference points, if it links one, and how.
function renderStatus(status: LinkStatus | null, entry: string | null) {
  if (status === null) return nothing;
  return html`<div class="status">
    ${entry === null ? nothing : html`<span class="entry">${entry}</span>`}
    <span class="chip">${status.label}</span>
  </div>`;
}

function renderSite(href: string, label: string) {
  return html`<a href=${href} target="_blank" rel="noopener">${label} ↗</a>`;
}

// What the source records, then links to the record on its own site and to
// its scan in Astia.
function renderDetails(body: unknown, url: string | null, link: Link | null) {
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
    </div>
  `;
}

// Whether folding the source out shows anything: what it records, or a
// link to it.
function hasDetails(body: unknown, url: string | null, link: Link | null) {
  return body !== nothing || url !== null || link !== null;
}

// Each section open or not for the rest of the visit, across people; at
// first only the Reminders and the sources are.
const opened = {
  reminders: true,
  events: false,
  family: false,
  sources: true
};
type Section = keyof typeof opened;

// Whether done Reminders are shown, for the rest of the visit.
let showDone = false;

// A source's open Reminders, as a marker with their count while it's
// folded (not `open`); clicking it unfolds the source.
function renderMarker(
  reminders: Reminder[],
  open: boolean,
  unfold: () => void
) {
  const count = reminders.filter((r) => r.done === null).length;
  if (open || count === 0) return nothing;
  return html`<button
    class="marker"
    aria-label=${count === 1 ? '1 reminder' : `${count} reminders`}
    @click=${unfold}
  >
    ⚑ ${count}
  </button>`;
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

// A source clicking opens (`active`), the one the Scan viewer shows
// (`viewing`), and one filed under its archive, titled by its Volume or
// Book (`linked`).
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

// The Selected person's family, events and sources, beside the chart.
// Record links open outside the app (the desktop shell
// hands target=_blank to the browser); a Link opens in the Scan viewer,
// and the source it shows is marked and brought into view.
@customElement('sl-person-panel')
export class PersonPanelElement extends SignalWatcher(LitElement) {
  static override styles = [focusRingStyles, personPanelStyles];

  @consume({ context: appState }) private readonly state!: AppState;

  // Whether the dock holding the panel is open.
  @property({ type: Boolean }) docked = false;

  // The source shown in full; the others show only their heading and links.
  @state() private unfolded: number | null = null;

  // A Reminder's menu and the dialog editing one. The menu is placed in
  // the element the panel is positioned in, so its scrolling doesn't clip
  // it.
  private readonly reminderActions = new ReminderActions(
    this,
    () => this.state,
    () => this.offsetParent?.getBoundingClientRect()
  );

  // Whose details are shown.
  private shownId: number | null = null;
  // The last source a picked Reminder asked to reveal, once it's taken.
  private revealTaken: object | null = null;
  // The source last brought into view, and the one the viewer last showed
  // and for whom.
  private revealed: LinkOpen | null = null;
  private lastOpen: { source: LinkOpen | null; personId: number | null } = {
    source: null,
    personId: null
  };

  override connectedCallback() {
    super.connectedCallback();
    this.state.reminders.load();
  }

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
    this.takeReveal();
  }

  // A source a picked Reminder asks to show, unfolded with Sources open,
  // once its person's details are in; brought into view once it's drawn.
  private takeReveal() {
    const { selected } = this.state;
    const asked = selected.reveal.get();
    const d = selected.details.get();
    if (asked === null || asked === this.revealTaken) return;
    if (d?.id !== asked.personId) return;
    this.revealTaken = asked;
    if (!d.citations.some((c) => c.id === asked.citationId)) return;
    this.unfolded = asked.citationId;
    void this.bringIntoView(asked.citationId);
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

  // The source in the Scan viewer, scrolled to.
  private async revealViewing() {
    const id = this.viewing?.citation.id;
    if (id !== undefined) await this.bringIntoView(id);
  }

  // A source scrolled to, opening Sources if need be, once they and the
  // source itself have slid open.
  private async bringIntoView(id: number) {
    if (!opened.sources) {
      opened.sources = true;
      this.requestUpdate();
    }
    await this.updateComplete;
    await this.renderRoot
      .querySelector('[data-section="sources"]')
      ?.querySelector('sl-fold')
      ?.settled();
    const source = this.renderRoot.querySelector(`[data-citation="${id}"]`);
    await source?.querySelector('sl-fold')?.settled();
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
  // Its Reminders show with its record, and a marker counts the open ones
  // while it's folded.
  private renderCitation(
    { citation: c, status }: Source,
    reminders: Reminder[]
  ) {
    const viewing = this.viewing?.citation.id === c.id;
    const heading = headingOf(c);
    const body = renderBody(c, heading);
    const link = status?.link ?? null;
    const filed = isFiled(status);
    const record = hasDetails(body, c.url, link)
      ? renderDetails(body, c.url, link)
      : nothing;
    const foldable = record !== nothing || reminders.length > 0;
    const open = this.unfolded === c.id && foldable;
    const act = this.actionOf(c, status, foldable);
    return html`
      <article
        class=${sourceClass({ active: act !== null, viewing, linked: filed })}
        data-citation=${c.id}
        @click=${(e: Event) => {
          const on = e.target as Element;
          const inside = on.closest('a, .fold, .marker, .record, .reminders');
          if (inside === null) act?.();
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
          ${renderMarker(reminders, open, () => {
            this.fold(c.id);
          })}
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
                ${record} ${this.renderSourceReminders(reminders)}
              </sl-fold>`
            : nothing
        }
      </article>
    `;
  }

  // A source's Reminders, under what it records.
  private renderSourceReminders(reminders: Reminder[]) {
    if (reminders.length === 0) return nothing;
    const { error, open } = this.reminderActions;
    return renderReminders(reminders, error, open);
  }

  // Each source keeps its own element, so another person's sources or a
  // reordering never slides one shut that was open.
  private renderGroup(g: SourceGroup, reminders: Map<number, Reminder[]>) {
    return html`
      ${g.label === null ? nothing : html`<h4>${g.label}</h4>`}
      ${repeat(
        g.sources,
        (source) => source.citation.id,
        (source) =>
          this.renderCitation(source, reminders.get(source.citation.id) ?? [])
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

  private renderSources(reminders: Map<number, Reminder[]>) {
    const groups = this.state.selected.sources.get();
    return groups.map((g) => this.renderGroup(g, reminders));
  }

  // The person's own Reminders, and Show done when any of theirs or their
  // Citations' are.
  private renderOwnReminders(own: Reminder[], done: number) {
    const none = showDone ? 'None on them.' : 'None open on them.';
    return html`
      ${
        own.length === 0
          ? html`<p class="muted none">${none}</p>`
          : renderReminders(
              own,
              this.reminderActions.error,
              this.reminderActions.open
            )
      }
      ${
        done === 0
          ? nothing
          : html`<button
              class="show-done"
              aria-pressed=${showDone ? 'true' : 'false'}
              @click=${() => {
                showDone = !showDone;
                this.requestUpdate();
              }}
            >
              ${showDone ? 'Hide done' : `Show done (${done})`}
            </button>`
      }
    `;
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
    const all = this.state.reminders.all.get();
    const { own, byCitation, done } = personReminders(
      Array.isArray(all) ? all : [],
      d.id,
      showDone
    );
    return html`
      <div class="body ${stale ? 'stale' : ''}">
        ${
          own.length === 0 && done === 0
            ? nothing
            : this.renderSection('reminders', 'Reminders', () =>
                this.renderOwnReminders(own, done)
              )
        }
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
                this.renderSources(byCitation)
              )
        }
      </div>
      ${this.reminderActions.render()}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-person-panel': PersonPanelElement;
  }
}
