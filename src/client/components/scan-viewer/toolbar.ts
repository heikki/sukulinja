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

import { groupVolumes, LINK_LABELS, MARK_HINTS, markOffer } from './helpers';
import { controlStyles, scanToolbarStyles } from './styles';

// A mark saved: the reference's links resolved again, and the one in the
// marked Volume for the viewer to follow.
export interface ScanMarked {
  resolved: CitationScans;
  link: Scan | null;
}

export type ScanMarkedEvent = CustomEvent<ScanMarked>;

interface Shown {
  id: string;
  label: string;
}

// The Scan viewer's one row: which Volume, where in it, where the
// reference's link stands to the shown Image, marking it as where the
// record is, and leaving. Asks the viewer for an Image with `scan-show`, a
// Volume with `scan-volume` and the link with `scan-link`; a saved mark is
// reported with `scan-marked`, and close with `scan-close`, both to the
// viewer's host.
@customElement('sl-scan-toolbar')
export class ScanToolbarElement extends LitElement {
  static override styles = [controlStyles, scanToolbarStyles];

  @property({ attribute: false }) citation: CitationRow | null = null;
  // The reference's link, if it has one.
  @property({ attribute: false }) link: Scan | null = null;
  // The parish's Volumes, once known, and the one shown, if any.
  @property({ attribute: false }) volumes: CitationVolume[] | null = null;
  @property({ attribute: false }) volume: Shown | null = null;
  @property({ type: Number }) image = 1;
  // The Volume's Image count, and Astia's link to the shown one, once known.
  @property({ attribute: false }) count: number | null = null;
  @property({ attribute: false }) astia: string | null = null;
  // The shown Image has loaded, so it can be marked.
  @property({ type: Boolean }) ready = false;

  @state() private saving = false;
  @state() private error: string | null = null;

  override willUpdate(changed: PropertyValues<this>) {
    const moved =
      changed.has('citation') || changed.has('volume') || changed.has('image');
    if (moved) this.error = null;
  }

  private ask(type: string, detail?: unknown) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
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

  // Grouped as `groupVolumes` says; the shown Volume is listed even before
  // the list arrives, and a prompt stands in until one is picked.
  private renderSwitcher() {
    const shown = this.volume;
    const groups = groupVolumes(this.volumes ?? []);
    const listed = groups.some((g) =>
      g.volumes.some((v) => v.id === shown?.id)
    );
    return html`
      <select
        title=${shown?.label ?? 'Pick a Volume'}
        aria-label="Volume"
        @change=${(e: Event) => {
          this.ask('scan-volume', (e.target as HTMLSelectElement).value);
        }}
      >
        ${
          shown === null
            ? html`<option value="" disabled .selected=${true}>
                ${this.volumes === null ? 'Finding Volumes…' : 'Pick a Volume'}
              </option>`
            : nothing
        }
        ${
          shown === null || listed
            ? nothing
            : html`<option value=${shown.id} .selected=${true}>
                ${shown.label}
              </option>`
        }
        ${groups.map(
          (g) => html`
            <optgroup label=${g.label}>
              ${g.volumes.map(
                (v) => html`
                  <option value=${v.id} .selected=${v.id === shown?.id}>
                    ${v.label}
                  </option>
                `
              )}
            </optgroup>
          `
        )}
      </select>
    `;
  }

  private renderNav() {
    const { count, image } = this;
    return html`
      <button
        title="Previous image (←)"
        aria-label="Previous image"
        ?disabled=${image <= 1}
        @click=${() => {
          this.ask('scan-show', image - 1);
        }}
      >
        ‹
      </button>
      <label>
        Image
        <input
          type="number"
          min="1"
          max=${count ?? nothing}
          .value=${live(String(image))}
          @change=${(e: Event) => {
            const input = e.target as HTMLInputElement;
            this.ask('scan-show', Number(input.value));
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
          this.ask('scan-show', image + 1);
        }}
      >
        ›
      </button>
    `;
  }

  // The link's method on its own Image, the way back to it elsewhere.
  private renderLink(link: Scan | null, shown: Shown) {
    if (link === null) return html`<span class="muted">No link</span>`;
    const inVolume = link.volumeId === shown.id;
    if (inVolume && (link.method === 'volume' || link.image === this.image)) {
      return html`<span class="muted">${LINK_LABELS[link.method]}</span>`;
    }
    return html`
      <button
        class="plain"
        title=${`${link.volume}, image ${link.image}`}
        @click=${() => {
          this.ask('scan-link');
        }}
      >
        Back to the link${inVolume ? ` (${link.image})` : ''}
      </button>
    `;
  }

  // Marking, or the ✓ of a link already found by hand or from Anchors.
  private renderMark(citation: CitationRow, shown: Shown) {
    const { link } = this;
    const offer = markOffer(
      link,
      { volumeId: shown.id, image: this.image },
      citation.citedPage !== null,
      this.volumes
    );
    if (offer === 'linked') {
      return html`<span class="linked">✓ ${LINK_LABELS[link!.method]}</span>`;
    }
    const note = this.error ?? (offer === 'unknown' ? null : MARK_HINTS[offer]);
    return html`
      ${this.renderLink(link, shown)}
      <span class="sep"></span>
      <button
        class="primary"
        ?disabled=${!this.ready || this.saving}
        @click=${() => {
          void this.mark(citation, shown.id);
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

  private renderShown(citation: CitationRow, shown: Shown) {
    return html`
      ${this.renderNav()}
      <span class="sep"></span>
      ${this.renderMark(citation, shown)}
    `;
  }

  override render() {
    const { citation, volume } = this;
    if (citation === null) return nothing;
    return html`
      ${this.renderSwitcher()}
      ${volume === null ? nothing : this.renderShown(citation, volume)}
      <span class="spacer"></span>
      ${
        this.astia === null || volume === null
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
