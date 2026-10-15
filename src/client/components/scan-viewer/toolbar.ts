import { html, LitElement, nothing } from 'lit';
import type { PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { live } from 'lit/directives/live.js';

import { apiUrl } from '@client/api';
import type {
  CitationRow,
  CitationScans,
  CitationVolume,
  Scan
} from '@common/types';

import { LINK_LABELS, MARK_HINTS, markOffer } from './helpers';
import { controlStyles, scanToolbarStyles } from './styles';

// A mark saved: the reference's links resolved again, and the one in the
// marked Volume for the viewer to follow.
export interface ScanMarked {
  resolved: CitationScans;
  link: Scan | null;
}

export type ScanMarkedEvent = CustomEvent<ScanMarked>;

// The Scan viewer's one row: where in the Volume, where the reference's
// link stands to the shown Image, marking it as where the record is, and
// leaving. Asks the viewer for an Image with `scan-show`; a saved mark is
// reported with `scan-marked`, and close with `scan-close`, both to the
// viewer's host.
@customElement('sl-scan-toolbar')
export class ScanToolbarElement extends LitElement {
  static override styles = [controlStyles, scanToolbarStyles];

  @property({ attribute: false }) citation: CitationRow | null = null;
  // The reference's link the viewer opened on.
  @property({ attribute: false }) link: Scan | null = null;
  @property({ type: Number }) image = 1;
  // The Volume's Image count, and Astia's link to the shown one, once known.
  @property({ attribute: false }) count: number | null = null;
  @property({ attribute: false }) astia: string | null = null;
  // The shown Image has loaded, so it can be marked.
  @property({ type: Boolean }) ready = false;
  // A next Image is on its way while the last one stays shown.
  @property({ type: Boolean }) busy = false;

  // The Volumes the reference links by its Book; null until they arrive.
  @state() private linked: ReadonlySet<string> | null = null;
  @state() private saving = false;
  @state() private error: string | null = null;

  private abort: AbortController | null = null;

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.abort?.abort();
  }

  override willUpdate(changed: PropertyValues<this>) {
    const id = this.citation?.id;
    if (changed.has('citation') && changed.get('citation')?.id !== id) {
      if (id !== undefined) void this.loadLinked(id);
    }
    if (changed.has('citation') || changed.has('image')) this.error = null;
  }

  private async loadLinked(id: number) {
    this.abort?.abort();
    const abort = new AbortController();
    this.abort = abort;
    this.linked = null;
    try {
      const res = await fetch(apiUrl(`/api/citations/${id}/volumes`), {
        signal: abort.signal
      });
      if (!res.ok) throw new Error(String(res.status));
      const volumes = (await res.json()) as CitationVolume[];
      this.linked = new Set(volumes.filter((v) => v.linked).map((v) => v.id));
    } catch {
      // Without them the button still marks; it just can't say how.
    }
  }

  private show(n: number) {
    this.dispatchEvent(new CustomEvent('scan-show', { detail: n }));
  }

  private emit(type: string, detail?: unknown) {
    this.dispatchEvent(
      new CustomEvent(type, { detail, bubbles: true, composed: true })
    );
  }

  private async mark(citation: CitationRow, volumeId: string) {
    const target = { volumeId, image: this.image };
    this.saving = true;
    this.error = null;
    try {
      const res = await fetch(apiUrl(`/api/citations/${citation.id}/scans`), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(target)
      });
      if (!res.ok) {
        this.error = await res.text();
        return;
      }
      const resolved = (await res.json()) as CitationScans;
      const scans = 'scans' in resolved ? resolved.scans : [];
      const detail: ScanMarked = {
        resolved,
        link: scans.find((s) => s.volumeId === volumeId) ?? null
      };
      this.emit('scan-marked', detail);
    } catch {
      this.error = 'The app is not responding.';
    } finally {
      this.saving = false;
    }
  }

  private renderNav(link: Scan) {
    const { count, image } = this;
    return html`
      <button
        title="Previous image (←)"
        aria-label="Previous image"
        ?disabled=${image <= 1}
        @click=${() => {
          this.show(image - 1);
        }}
      >
        ‹
      </button>
      <label title=${link.volume}>
        Image
        <input
          type="number"
          min="1"
          max=${count ?? nothing}
          .value=${live(String(image))}
          @change=${(e: Event) => {
            const input = e.target as HTMLInputElement;
            this.show(Number(input.value));
            input.value = String(this.image);
          }}
        />
        ${count === null ? nothing : html`of ${count}`}
      </label>
      <button
        title="Next image (→)"
        aria-label="Next image"
        ?disabled=${count !== null && image >= count}
        @click=${() => {
          this.show(image + 1);
        }}
      >
        ›
      </button>
    `;
  }

  // The link's method on its own Image, the way back to it elsewhere.
  private renderLink(link: Scan) {
    if (link.method === 'volume' || link.image === this.image) {
      return html`<span class="muted">${LINK_LABELS[link.method]}</span>`;
    }
    return html`
      <button
        class="plain"
        @click=${() => {
          this.show(link.image);
        }}
      >
        Back to the link (${link.image})
      </button>
    `;
  }

  // Marking, or the ✓ of a link already found by hand or from Anchors.
  private renderMark(citation: CitationRow, link: Scan) {
    const shown = { volumeId: link.volumeId, image: this.image };
    const offer = markOffer(
      link,
      shown,
      citation.citedPage !== null,
      this.linked
    );
    if (offer === 'linked') {
      return html`<span class="linked">✓ ${LINK_LABELS[link.method]}</span>`;
    }
    const note = this.error ?? (offer === 'unknown' ? null : MARK_HINTS[offer]);
    return html`
      ${this.renderLink(link)}
      <span class="sep"></span>
      <button
        class="primary"
        ?disabled=${!this.ready || this.saving}
        @click=${() => {
          void this.mark(citation, link.volumeId);
        }}
      >
        The record is here
      </button>
      ${
        note === null
          ? nothing
          : html`<span
              class="note ${this.error === null ? '' : 'error'}"
              title=${note}
              >${note}</span
            >`
      }
    `;
  }

  override render() {
    const { citation, link } = this;
    if (link === null) return nothing;
    return html`
      ${this.renderNav(link)}
      <span class="sep"></span>
      ${
        citation === null
          ? this.renderLink(link)
          : this.renderMark(citation, link)
      }
      <span class="spacer"></span>
      ${this.busy ? html`<span class="muted">Loading…</span>` : nothing}
      ${
        this.astia === null
          ? nothing
          : html`<a href=${this.astia} target="_blank" rel="noopener">
              Open in Astia ↗
            </a>`
      }
      <button
        title="Close (Esc)"
        aria-label="Close"
        @click=${() => {
          this.emit('scan-close');
        }}
      >
        ✕
      </button>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-scan-toolbar': ScanToolbarElement;
  }
}
