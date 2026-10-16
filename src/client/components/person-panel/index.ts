import { html, LitElement, nothing } from 'lit';
import type { PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { apiUrl } from '@client/api';
import { readNdjson } from '@client/ndjson';
import type {
  CitationRow,
  CitationScans,
  PersonDetails,
  RecordView,
  Scan,
  ScanResolution
} from '@common/types';

import './header';

import { factLabel, factText, scanStatus, siteName } from './helpers';
import type { ScanStatus } from './helpers';
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

// Opening a church-book source asks for the Scan viewer on that scan of its
// reference, or on none to look for the Image.
export interface ScanOpen {
  citation: CitationRow;
  scan: Scan | null;
}

export type ScanOpenEvent = CustomEvent<ScanOpen>;

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

function renderStatus(status: ScanStatus | null) {
  if (status === null) return nothing;
  return html`<div class="status">
    <span class="chip" title=${status.title}>${status.label}</span>
  </div>`;
}

// What the source records, then a link to the record on its own site.
function renderDetails(body: unknown, url: string | null) {
  return html`
    <div class="record">
      ${body}
      ${
        url === null
          ? nothing
          : html`<a class="site" href=${url} target="_blank" rel="noopener">
              Open on ${siteName(url)} ↗
            </a>`
      }
    </div>
  `;
}

// A Church-book reference names itself; other sources go by their title,
// or failing that what they say.
function headingOf(c: CitationRow) {
  return c.reference ?? c.source ?? c.text ?? c.page ?? 'Source';
}

// Each section open or not for the rest of the visit, across people; at
// first only the sources are.
const opened = { events: false, sources: true };
type Section = keyof typeof opened;

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

// The Focus person's events and sources, beside the chart, announced with
// `details-load` as they arrive. Record links open outside the app (the
// desktop shell hands target=_blank to the browser); Scan links ask for the
// Scan viewer with a `scan-open` event, and the source it shows (`viewing`)
// is marked and brought into view.
@customElement('sl-person-panel')
export class PersonPanelElement extends LitElement {
  static override styles = personPanelStyles;

  @property({ type: Number }) personId: number | null = null;
  @property({ attribute: false }) viewing: ScanOpen | null = null;

  @state() private details: PersonDetails | null = null;
  @state() private error: string | null = null;
  @state() private scans = new Map<number, ScanResolution>();
  @state() private scansPending = false;
  // The source shown in full; the others show only their heading and links.
  @state() private selected: number | null = null;

  private scanAbort: AbortController | null = null;
  private shownId: number | null = null;

  // Refocusing fast can return answers out of order; only the latest counts.
  private request = 0;

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
      void this.loadScans(id, false);
    } catch (err) {
      if (request !== this.request) return;
      this.error = err instanceof Error ? err.message : 'failed to load';
    }
  }

  // One streamed request per person; refocusing aborts it. A reload after a
  // mark keeps the scans known until their new ones arrive.
  private async loadScans(id: number, keep: boolean) {
    this.scanAbort?.abort();
    const abort = new AbortController();
    this.scanAbort = abort;
    if (!keep) this.scans = new Map();
    this.scansPending = true;
    try {
      const res = await fetch(apiUrl(`/api/persons/${id}/scans`), {
        signal: abort.signal
      });
      if (!res.ok || res.body === null) throw new Error(String(res.status));
      await readNdjson(res.body, (raw) => {
        const { citationId, ...scan } = raw as CitationScans;
        this.scans = new Map(this.scans).set(citationId, scan);
      });
    } catch {
      // Unresolved citations show as unavailable once pending clears.
    } finally {
      if (!abort.signal.aborted) this.scansPending = false;
    }
  }

  // A reference marked in the Scan viewer, resolved again. Its anchor can
  // move the person's other references in the Volume too, so they reload.
  takeScans(resolved: CitationScans) {
    const { citationId, ...scan } = resolved;
    this.scans = new Map(this.scans).set(citationId, scan);
    if (this.personId !== null) void this.loadScans(this.personId, true);
  }

  private openScan(citation: CitationRow, scan: Scan | null) {
    this.dispatchEvent(
      new CustomEvent<ScanOpen>('scan-open', {
        detail: { citation, scan },
        bubbles: true,
        composed: true
      })
    );
  }

  // What clicking the source does: open its scan if it is a church book
  // that has one or can be looked for, else show or hide its record.
  private actionOf(
    c: CitationRow,
    status: ScanStatus | null,
    foldable: boolean
  ) {
    const target = status?.target ?? null;
    if (target !== null) {
      return () => {
        this.openScan(c, target.scan);
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

  // Clicking a church-book source opens its scan; clicking another shows or
  // hides what it records, as its chevron does for both. Its record shows
  // only when selected, and opening it in the Scan viewer leaves it as it is.
  private renderCitation(c: CitationRow) {
    const viewing = this.viewing?.citation.id === c.id;
    const status = c.churchBook
      ? scanStatus(this.scans.get(c.id), this.scansPending)
      : null;
    const heading = headingOf(c);
    const body = renderBody(c, heading);
    const foldable = body !== nothing || c.url !== null;
    const open = this.selected === c.id && foldable;
    const act = this.actionOf(c, status, foldable);
    return html`
      <article
        class="source ${act === null ? '' : 'active'} ${
          viewing ? 'viewing' : ''
        }"
        data-citation=${c.id}
        @click=${(e: Event) => {
          const on = e.target as Element;
          if (on.closest('a, .fold, .record') === null) act?.();
        }}
      >
        <div class="top">
          <button
            class="title"
            ?disabled=${act === null}
            aria-current=${viewing ? 'true' : nothing}
            title=${titleOf(c, heading)}
          >
            ${heading}
          </button>
          ${
            foldable
              ? renderFold(open, () => {
                  this.fold(c.id);
                })
              : nothing
          }
        </div>
        ${open ? renderDetails(body, c.url) : nothing} ${renderStatus(status)}
      </article>
    `;
  }

  private renderGroup(label: string | null, rows: CitationRow[]) {
    if (rows.length === 0) return nothing;
    return html`
      ${label === null ? nothing : html`<h4>${label} · ${rows.length}</h4>`}
      ${rows.map((c) => this.renderCitation(c))}
    `;
  }

  // Church books first, in date order as the server sends them, then the
  // others; named apart only when there are both.
  private renderSources(citations: CitationRow[]) {
    const books = citations.filter((c) => c.churchBook);
    const others = citations.filter((c) => !c.churchBook);
    const named = books.length > 0 && others.length > 0;
    return [
      this.renderGroup(named ? 'Church books' : null, books),
      this.renderGroup(named ? 'Other' : null, others)
    ];
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
    return html`
      <div class="body ${stale ? 'stale' : ''}">
        ${
          d.facts.length === 0
            ? nothing
            : this.renderSection(
                'events',
                `Events · ${d.facts.length}`,
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
            : this.renderSection(
                'sources',
                `Sources · ${d.citations.length}`,
                () => this.renderSources(d.citations)
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
