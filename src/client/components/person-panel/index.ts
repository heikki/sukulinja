import { html, LitElement, nothing } from 'lit';
import type { PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { apiUrl } from '@client/api';
import { focusRingStyles } from '@client/focus-ring';
import { volumeTitle } from '@client/link-labels';
import { readNdjson } from '@client/ndjson';
import type {
  CitationLinks,
  CitationRow,
  Link,
  LinkResolution,
  PersonDetails,
  RecordView
} from '@common/types';

import type { ScanCloseEvent, ScanStepEvent } from '../scan-viewer';
import { formatName } from '../tree-view/renderer';

import './header';

import { householdsOf, lifeText } from './family';
import type { FamilyIndices, Household, Relative } from './family';
import {
  factLabel,
  factText,
  groupSources,
  linkStatus,
  siteName
} from './helpers';
import type { LinkStatus, SourceGroup } from './helpers';
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

// Opening a church-book source asks for the Scan viewer on that Link of its
// reference.
export interface LinkOpen {
  citation: CitationRow;
  link: Link;
}

export type LinkOpenEvent = CustomEvent<LinkOpen>;

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

// Where in the Volume it links the reference points; nothing unlinked.
function linkedEntry(c: CitationRow, link: Link | null) {
  return link === null ? null : c.entry;
}

// A source clicking opens (`active`), the one the Scan viewer shows
// (`viewing`), and one titled by the Volume it links (`linked`).
function sourceClass(flags: Record<string, boolean>) {
  const on = Object.entries(flags).filter(([, v]) => v);
  return ['source', ...on.map(([k]) => k)].join(' ');
}

// Under its archive, a Church-book reference goes by the Volume it links,
// named as Astia names it but for its code: "Pää- ja rippikirjat
// (1783-1790)".
function titleText(c: CitationRow, link: Link | null) {
  return link === null ? headingOf(c) : volumeTitle(link.volume);
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

export type DetailsLoadEvent = CustomEvent<PersonDetails>;

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
      ${life === '' ? nothing : html`<span class="life">${life}</span>`}
    </span>
  </button>`;
}

// The selected person's family, events and sources, beside the chart, the
// details announced with `details-load` as they arrive. A relative's row
// asks for them with `pick`, and for the chart built around them with
// `center`. Record links open outside the app (the desktop
// shell hands target=_blank to the browser); Links ask for the Scan
// viewer with a `scan-open` event, and the source it shows (`viewing`) is
// marked and brought into view.
@customElement('sl-person-panel')
export class PersonPanelElement extends LitElement {
  static override styles = [focusRingStyles, personPanelStyles];

  @property({ type: Number }) personId: number | null = null;
  @property({ attribute: false }) viewing: LinkOpen | null = null;
  // The chart's persons and families, which name the person's households.
  @property({ attribute: false }) indices: FamilyIndices | null = null;

  @state() private details: PersonDetails | null = null;
  @state() private error: string | null = null;
  @state() private links = new Map<number, LinkResolution>();
  @state() private linksPending = false;
  // The source shown in full; the others show only their heading and links.
  @state() private selected: number | null = null;

  private scanAbort: AbortController | null = null;
  private shownId: number | null = null;

  // Selecting fast can return answers out of order; only the latest counts.
  private request = 0;

  override connectedCallback() {
    super.connectedCallback();
    window.addEventListener('scan-step', this.onStep);
    window.addEventListener('scan-close', this.onClose);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('scan-step', this.onStep);
    window.removeEventListener('scan-close', this.onClose);
  }

  // The Scan viewer closing hands focus back to the source it showed,
  // where that can be seen.
  private readonly onClose = (e: Event) => {
    const { citationId } = (e as ScanCloseEvent).detail;
    if (!this.sourcesShown()) return;
    const source = this.renderRoot.querySelector(
      `[data-citation="${citationId}"] button.title`
    );
    if (source instanceof HTMLElement) source.focus({ preventScroll: true });
  };

  // Whether the sources can be seen: their section is open, and so is the
  // dock holding the panel.
  private sourcesShown() {
    const dock = this.closest('sl-side-dock');
    return opened.sources && (dock === null || dock.open);
  }

  // The Scan viewer asks for the source before or after the one it shows:
  // the next in the list with a Link, none past either end. Only while
  // the list can be seen, so the step is one the person can follow.
  private readonly onStep = (e: Event) => {
    if (!this.sourcesShown()) return;
    const { citationId, step } = (e as ScanStepEvent).detail;
    const citations = this.details?.citations ?? [];
    const linked = groupSources(citations, this.links).flatMap((g) =>
      g.rows.flatMap((c) => {
        const link = this.statusOf(c)?.link ?? null;
        return link === null ? [] : [{ c, link }];
      })
    );
    const at = linked.findIndex((l) => l.c.id === citationId);
    const next = at < 0 ? undefined : linked[at + step];
    if (next !== undefined) this.openScan(next.c, next.link);
  };

  override willUpdate(changed: PropertyValues<this>) {
    if (changed.has('personId')) void this.load();
  }

  // Start a new person at the top. Waits for their details rather than the
  // personId change, so the stale view doesn't jump before it's replaced.
  override updated(changed: PropertyValues<this>) {
    if (changed.has('viewing')) void this.revealViewing();
    const id = this.details?.id ?? null;
    if (id === this.shownId) return;
    this.shownId = id;
    this.scrollTop = 0;
  }

  // The source in the Scan viewer, scrolled to, opening Sources if need be.
  private async revealViewing() {
    const id = this.viewing?.citation.id;
    if (id === undefined) return;
    if (!opened.sources) {
      opened.sources = true;
      this.requestUpdate();
      await this.updateComplete;
    }
    const source = this.renderRoot.querySelector(`[data-citation="${id}"]`);
    source?.scrollIntoView({ block: 'nearest' });
  }

  private async load() {
    const id = this.personId;
    const request = ++this.request;
    this.scanAbort?.abort();
    if (id === null) {
      this.details = null;
      return;
    }
    try {
      const res = await fetch(apiUrl(`/api/persons/${id}`));
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      const details = (await res.json()) as PersonDetails;
      if (request !== this.request) return;
      this.details = details;
      this.error = null;
      this.dispatchEvent(new CustomEvent('details-load', { detail: details }));
      this.selected = null;
      void this.loadLinks(id, false);
    } catch (err) {
      if (request !== this.request) return;
      this.error = err instanceof Error ? err.message : 'failed to load';
    }
  }

  // One streamed request per person; selecting someone else aborts it. A
  // reload after a Mark keeps the Links known until their new ones arrive.
  private async loadLinks(id: number, keep: boolean) {
    this.scanAbort?.abort();
    const abort = new AbortController();
    this.scanAbort = abort;
    if (!keep) this.links = new Map();
    this.linksPending = true;
    try {
      const res = await fetch(apiUrl(`/api/persons/${id}/scans`), {
        signal: abort.signal
      });
      if (!res.ok || res.body === null) throw new Error(String(res.status));
      await readNdjson(res.body, (raw) => {
        const { citationId, ...resolution } = raw as CitationLinks;
        this.links = new Map(this.links).set(citationId, resolution);
      });
    } catch {
      // Unresolved citations show as unavailable once pending clears.
    } finally {
      if (!abort.signal.aborted) this.linksPending = false;
    }
  }

  // A reference marked in the Scan viewer, resolved again. Its Page pin can
  // move the person's other references in the Volume too, so they reload.
  takeLinks(resolved: CitationLinks) {
    const { citationId, ...resolution } = resolved;
    this.links = new Map(this.links).set(citationId, resolution);
    if (this.personId !== null) void this.loadLinks(this.personId, true);
  }

  // Each opening is a new link, so the viewer goes back to it even when
  // it's showing this source already.
  private openScan(citation: CitationRow, link: Link) {
    this.dispatchEvent(
      new CustomEvent<LinkOpen>('scan-open', {
        detail: { citation, link: { ...link } },
        bubbles: true,
        composed: true
      })
    );
  }

  // What clicking the source does: open its scan if it is a church book
  // that has one, else show or hide its record.
  private actionOf(c: CitationRow, link: Link | null, foldable: boolean) {
    if (link !== null) {
      return () => {
        this.openScan(c, link);
      };
    }
    if (!foldable) return null;
    return () => {
      this.fold(c.id);
    };
  }

  private fold(id: number) {
    this.selected = this.selected === id ? null : id;
  }

  private statusOf(c: CitationRow) {
    if (!c.churchBook) return null;
    return linkStatus(this.links.get(c.id), this.linksPending);
  }

  // Clicking a church-book source opens its scan; clicking another shows or
  // hides what it records, as its chevron does for both. Its record shows
  // only when selected, and opening it in the Scan viewer leaves it as it is.
  private renderCitation(c: CitationRow) {
    const viewing = this.viewing?.citation.id === c.id;
    const status = this.statusOf(c);
    const heading = headingOf(c);
    const body = renderBody(c, heading);
    const link = status?.link ?? null;
    const foldable = hasDetails(body, c.url, link);
    const open = this.selected === c.id && foldable;
    const act = this.actionOf(c, link, foldable);
    return html`
      <article
        class=${sourceClass({ active: act !== null, viewing, linked: link !== null })}
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
              ${titleText(c, link)}
            </button>
            ${renderStatus(status, linkedEntry(c, link))}
          </div>
          ${
            foldable
              ? renderFold(open, () => {
                  this.fold(c.id);
                })
              : nothing
          }
        </div>
        ${open ? renderDetails(body, c.url, link) : nothing}
      </article>
    `;
  }

  private renderGroup(g: SourceGroup) {
    return html`
      ${g.label === null ? nothing : html`<h4>${g.label}</h4>`}
      ${g.rows.map((c) => this.renderCitation(c))}
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

  private renderSources(citations: CitationRow[]) {
    return groupSources(citations, this.links).map((g) => this.renderGroup(g));
  }

  // A heading that shows or hides what follows it.
  private renderSection(
    section: Section,
    label: string,
    content: () => unknown
  ) {
    const open = opened[section];
    return html`
      <section>
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
        ${open ? html`<div class="section-body">${content()}</div>` : nothing}
      </section>
    `;
  }

  override render() {
    if (this.error !== null) {
      return html`<div class="body muted">Couldn't load: ${this.error}</div>`;
    }
    const d = this.details;
    if (d === null) return html`<div class="body muted">Loading…</div>`;
    const stale = d.id !== this.personId;
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
                this.renderSources(d.citations)
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
