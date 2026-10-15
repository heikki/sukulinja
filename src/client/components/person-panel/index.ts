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

import { factLabel, factText } from './helpers';
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
// Church-book reference.
export interface ScanOpen {
  citation: CitationRow;
  scan: Scan;
}

export type ScanOpenEvent = CustomEvent<ScanOpen>;

const SCAN_LABELS: Record<ScanMethod, string> = {
  anchored: 'Scan',
  estimated: 'Scan (approximate)',
  placed: 'Scan',
  volume: 'Volume'
};

// `viewing`: the scan of this citation the Scan viewer shows, if any.
function renderScan(
  c: CitationRow,
  s: Scan,
  part: string,
  viewing: Scan | null
) {
  const current = viewing?.volumeId === s.volumeId;
  return html`
    <button
      class="scan"
      title=${`${s.volume}, image ${s.image}`}
      aria-current=${current ? 'true' : nothing}
      @click=${(e: Event) => {
        const detail: ScanOpen = { citation: c, scan: s };
        e.currentTarget!.dispatchEvent(
          new CustomEvent('scan-open', {
            detail,
            bubbles: true,
            composed: true
          })
        );
      }}
    >
      ${SCAN_LABELS[s.method]}${part}
    </button>
  `;
}

// Scans arrive after the panel renders; until then the link is pending.
function renderScans(
  c: CitationRow,
  scan: ScanResolution | undefined,
  pending: boolean,
  viewing: Scan | null
) {
  if (scan === undefined) {
    return html`<span class="muted">
      ${pending ? 'Finding scan…' : 'Scan unavailable'}
    </span>`;
  }
  if ('error' in scan) {
    return html`<span class="muted" title=${scan.error}>No scan found</span>`;
  }
  return scan.scans.map((s, i, all) =>
    renderScan(c, s, all.length > 1 ? ` ${i + 1}/${all.length}` : '', viewing)
  );
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

  // The source in the Scan viewer, scrolled to with its household open for
  // comparing against the page.
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

  private renderCitation(c: CitationRow) {
    const scan = this.scans.get(c.id);
    const viewing =
      this.viewing?.citation.id === c.id ? this.viewing.scan : null;
    return html`
      <article
        class="source ${viewing === null ? '' : 'viewing'}"
        data-citation=${c.id}
      >
        ${
          c.source === null
            ? nothing
            : html`<div class="caption">${c.source}</div>`
        }
        ${
          c.record === null
            ? html`<p class="text">${c.text ?? c.page ?? ''}</p>`
            : renderRecord(c.record)
        }
        ${
          c.url === null
            ? nothing
            : html`
                <div class="links">
                  <a href=${c.url} target="_blank" rel="noopener">Record ↗</a>
                  ${
                    c.churchBook
                      ? renderScans(c, scan, this.scansPending, viewing)
                      : nothing
                  }
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
