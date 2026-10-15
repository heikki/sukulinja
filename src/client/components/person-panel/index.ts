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
  ScanMethod,
  ScanResolution
} from '@common/types';

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
            <details>
              <summary>Household · ${r.household.length}</summary>
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
            </details>
          `
    }
  `;
}

// A Scan link asks for the Scan viewer on that scan of the citation's
// Church-book reference; "Find the image" asks for it with none.
export interface ScanOpen {
  citation: CitationRow;
  scan: Scan | null;
}

export type ScanOpenEvent = CustomEvent<ScanOpen>;

// Opens in the Scan viewer, so no ↗: that marks links leaving the app.
const SCAN_LABELS: Record<ScanMethod, string> = {
  anchored: 'Astia',
  estimated: 'Astia (approximate)',
  placed: 'Astia',
  volume: 'Astia volume'
};

// Resolving found the parish's books but not the Image, so it can be looked
// for by hand. Other errors (no archive, unparsed, Astia down) can't.
const FINDABLE = new Set(['no matching volume', 'not digitized', 'no images']);

function renderOpen(
  open: ScanOpen,
  label: string,
  title: string,
  current: boolean
) {
  return html`
    <button
      class="scan"
      title=${title}
      aria-current=${current ? 'true' : nothing}
      @click=${(e: Event) => {
        e.currentTarget!.dispatchEvent(
          new CustomEvent('scan-open', {
            detail: open,
            bubbles: true,
            composed: true
          })
        );
      }}
    >
      ${label}
    </button>
  `;
}

// Scans arrive after the panel renders; until then the link is pending.
// `viewing`: what the Scan viewer shows of this citation, if anything.
function renderScans(
  c: CitationRow,
  scan: ScanResolution | undefined,
  pending: boolean,
  viewing: ScanOpen | null
) {
  if (scan === undefined) {
    return html`<span class="muted">
      ${pending ? 'Finding scan…' : 'Scan unavailable'}
    </span>`;
  }
  if ('error' in scan) {
    return FINDABLE.has(scan.error)
      ? renderOpen(
          { citation: c, scan: null },
          'Find the image',
          `No scan found: ${scan.error}`,
          viewing?.scan === null
        )
      : html`<span class="muted" title=${scan.error}>No scan found</span>`;
  }
  // A Split reference opens on its first candidate; the viewer's switcher
  // lists the others first.
  const [first] = scan.scans;
  if (first === undefined) return nothing;
  const split = scan.scans.length > 1;
  return renderOpen(
    { citation: c, scan: first },
    split ? `Astia (${scan.scans.length} Volumes)` : SCAN_LABELS[first.method],
    scan.scans.map((s) => `${s.volume}, image ${s.image}`).join('\n'),
    viewing !== null && viewing.scan !== null
  );
}

// A Church-book reference names itself; other sources go by their title,
// or failing that what they say.
function headingOf(c: CitationRow) {
  return c.reference ?? c.source ?? c.text ?? c.page ?? 'Source';
}

function renderBody(c: CitationRow, heading: string) {
  if (c.record !== null) return renderRecord(c.record);
  const text = c.text ?? c.page;
  return text === null || text === heading
    ? nothing
    : html`<p class="text">${text}</p>`;
}

// The Focus person's events and sources, beside the chart. Record links open
// outside the app (the desktop shell hands target=_blank to the browser);
// Scan links ask for the Scan viewer with a `scan-open` event, and the source
// it shows (`viewing`) is marked and brought into view.
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
    if (changed.has('viewing')) this.revealViewing();
    const id = this.details?.id ?? null;
    if (id === this.shownId) return;
    this.shownId = id;
    this.scrollTop = 0;
  }

  // The source in the Scan viewer, scrolled to; if it is expanded, with its
  // household open for comparing against the page.
  private revealViewing() {
    const id = this.viewing?.citation.id;
    if (id === undefined) return;
    const source = this.renderRoot.querySelector(`[data-citation="${id}"]`);
    source?.scrollIntoView({ block: 'nearest' });
    const household = source?.querySelector('details');
    if (household !== null && household !== undefined) household.open = true;
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
      this.selected = null;
      void this.loadScans(id, false);
    } catch (err) {
      if (request !== this.request) return;
      this.error = err instanceof Error ? err.message : 'failed to load';
    }
  }

  // One streamed request per person; refocusing aborts it. A reload after a
  // mark keeps the links shown until their new ones arrive.
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

  // Collapsed to its heading and links unless selected. Opening it in the
  // Scan viewer marks it but leaves it as it is.
  private renderCitation(c: CitationRow) {
    const scan = this.scans.get(c.id);
    const viewing = this.viewing?.citation.id === c.id ? this.viewing : null;
    const open = this.selected === c.id;
    const heading = headingOf(c);
    return html`
      <article
        class="source ${viewing === null ? '' : 'viewing'}"
        data-citation=${c.id}
      >
        <button
          class="head"
          aria-expanded=${open ? 'true' : 'false'}
          title=${c.reference === null ? heading : (c.source ?? heading)}
          @click=${() => {
            this.selected = open ? null : c.id;
          }}
        >
          <span>${heading}</span>
        </button>
        ${open ? renderBody(c, heading) : nothing}
        ${
          c.url === null
            ? nothing
            : html`
                <div class="links">
                  ${
                    c.churchBook
                      ? renderScans(c, scan, this.scansPending, viewing)
                      : nothing
                  }
                  <a href=${c.url} target="_blank" rel="noopener">
                    ${siteName(c.url)} ↗
                  </a>
                </div>
              `
        }
      </article>
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
            : html`
                <h3>Events</h3>
                <dl>
                  ${d.facts.map(
                    (f) =>
                      html`<dt>${factLabel(f)}</dt>
                        <dd>${factText(f)}</dd>`
                  )}
                </dl>
              `
        }
        ${
          d.citations.length === 0
            ? nothing
            : html`
                <h3>Sources · ${d.citations.length}</h3>
                ${d.citations.map((c) => this.renderCitation(c))}
              `
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
