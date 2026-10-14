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

const SCAN_LABELS: Record<ScanMethod, string> = {
  anchored: 'Scan',
  estimated: 'Scan (approximate)',
  placed: 'Scan',
  volume: 'Volume'
};

function renderScan(s: Scan, i: number, all: Scan[]) {
  const part = all.length > 1 ? ` ${i + 1}/${all.length}` : '';
  return html`
    <a
      href=${s.url}
      target="_blank"
      rel="noopener"
      title=${`${s.volume}, image ${s.image}`}
    >
      ${SCAN_LABELS[s.method]}${part} ↗
    </a>
  `;
}

// Scans arrive after the panel renders; until then the link is pending.
function renderScans(scan: ScanResolution | undefined, pending: boolean) {
  if (scan === undefined) {
    return html`<span class="muted">
      ${pending ? 'Finding scan…' : 'Scan unavailable'}
    </span>`;
  }
  if ('error' in scan) {
    return html`<span class="muted" title=${scan.error}>No scan found</span>`;
  }
  return scan.scans.map(renderScan);
}

function renderCitation(
  c: CitationRow,
  scan: ScanResolution | undefined,
  pending: boolean,
  correction: unknown
) {
  return html`
    <article class="source">
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
                ${c.churchBook ? renderScans(scan, pending) : nothing}
              </div>
            `
      }
      ${correction}
    </article>
  `;
}

// A volume-only link has no image to be wrong yet.
function correctLabel(first: Scan | null) {
  return first === null || first.method === 'volume'
    ? 'Find the image'
    : 'Wrong image?';
}

function correctionPrompt(c: CitationRow, first: Scan | null) {
  const where =
    c.citedPage === null
      ? 'Where is this record?'
      : `Where is page ${c.citedPage}?`;
  const how =
    first === null
      ? 'Paste the Astia link of the right image'
      : `Give the image number in ${first.volume}, or paste the Astia link of the right image`;
  return `${where} ${how} — any of the parish's books.`;
}

// The Focus person's events and sources, beside the chart. Links open
// outside the app (the desktop shell hands target=_blank to the browser).
@customElement('sl-person-panel')
export class PersonPanelElement extends LitElement {
  static override styles = personPanelStyles;

  @property({ type: Number }) personId: number | null = null;

  @state() private details: PersonDetails | null = null;
  @state() private error: string | null = null;
  @state() private scans = new Map<number, ScanResolution>();
  @state() private scansPending = false;
  // The citation whose scan is being corrected, and what went wrong.
  @state() private correcting: number | null = null;
  @state() private correctionError: string | null = null;

  private scanAbort: AbortController | null = null;

  // Refocusing fast can return answers out of order; only the latest counts.
  private request = 0;

  override willUpdate(changed: PropertyValues<this>) {
    if (changed.has('personId')) void this.load();
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
      this.correcting = null;
      void this.loadScans(id, false);
    } catch (err) {
      if (request !== this.request) return;
      this.error = err instanceof Error ? err.message : 'failed to load';
    }
  }

  // One streamed request per person; refocusing aborts it. A reload after a
  // correction keeps the links shown until their new ones arrive.
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

  // An image number in the linked volume, or an Astia viewer link to any
  // image of the candidate volumes. The server saves it as an anchor for the
  // cited page, which also moves nearby citations; they're reloaded.
  private async correct(c: CitationRow, scan: Scan | null, input: string) {
    const where = input.trim();
    const number = /^\d+$/.test(where);
    if (number && scan === null) {
      this.correctionError = 'Paste the Astia link of the image.';
      return;
    }
    const body = number
      ? { volumeId: scan!.volumeId, image: Number(where) }
      : { url: where };
    const res = await fetch(apiUrl(`/api/citations/${c.id}/scans`), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    }).catch(() => null);
    if (res === null) {
      this.correctionError = 'The app is not responding.';
      return;
    }
    if (!res.ok) {
      this.correctionError = await res.text();
      return;
    }
    const { citationId, ...resolution } = (await res.json()) as CitationScans;
    this.scans = new Map(this.scans).set(citationId, resolution);
    this.correcting = null;
    if (this.personId !== null) void this.loadScans(this.personId, true);
  }

  private renderCorrection(c: CitationRow, scan: ScanResolution | undefined) {
    if (!c.churchBook || scan === undefined) return nothing;
    const first = 'scans' in scan ? (scan.scans[0] ?? null) : null;
    if (this.correcting !== c.id) {
      return html`
        <button
          class="link"
          @click=${() => {
            this.correcting = c.id;
            this.correctionError = null;
          }}
        >
          ${correctLabel(first)}
        </button>
      `;
    }
    return html`
      <form
        class="correction"
        @submit=${(e: SubmitEvent) => {
          e.preventDefault();
          const input = (e.target as HTMLFormElement).elements.namedItem(
            'where'
          ) as HTMLInputElement;
          void this.correct(c, first, input.value);
        }}
      >
        <p class="muted">${correctionPrompt(c, first)}</p>
        <input
          name="where"
          required
          autofocus
          placeholder=${first === null ? 'Astia link' : 'e.g. 107'}
        />
        <button type="submit">Save</button>
        <button
          type="button"
          @click=${() => {
            this.correcting = null;
          }}
        >
          Cancel
        </button>
        ${
          this.correctionError === null
            ? nothing
            : html`<p class="error">${this.correctionError}</p>`
        }
      </form>
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
        <h2>${d.name ?? '—'}</h2>
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
                ${d.citations.map((c) =>
                  renderCitation(
                    c,
                    this.scans.get(c.id),
                    this.scansPending,
                    this.renderCorrection(c, this.scans.get(c.id))
                  )
                )}
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
