import { css, html, LitElement, nothing, svg } from 'lit';
import type { PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { currentAppearance, setAppearance } from '@client/appearance';
import type { Appearance } from '@client/appearance';
import {
  MAX_GENERATIONS,
  preferredGenerations,
  setPreferredGenerations
} from '@client/generations';
import type { ScanCacheStatus } from '@common/types';

import { formatBytes } from './helpers';

export type GenerationsChangeEvent = CustomEvent<number>;

const APPEARANCES: ReadonlyArray<{ value: Appearance; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' }
];

// A ring with eight teeth around a hub, in currentColor like the other icons.
const GEAR_ICON = html`<svg viewBox="0 0 16 16" aria-hidden="true">
  ${svg`
    <circle cx="8" cy="8" r="4.5" fill="none" stroke="currentColor" stroke-width="1.5" />
    <circle cx="8" cy="8" r="1.75" fill="none" stroke="currentColor" stroke-width="1.4" />
    <path
      d="M 12.5 8 H 14.75 M 11.18 11.18 L 12.77 12.77 M 8 12.5 V 14.75 M 4.82 11.18 L 3.23 12.77 M 3.5 8 H 1.25 M 4.82 4.82 L 3.23 3.23 M 8 3.5 V 1.25 M 11.18 4.82 L 12.77 3.23"
      stroke="currentColor"
      stroke-width="2.2"
      stroke-linecap="round"
    />
  `}
</svg>`;

// The gear at the end of the top bar and the popover it opens. Non-modal, so
// the chart stays in view and reflows as Generations changes; a click anywhere
// outside, the gear again, or Escape closes it. Generations is the chart's
// Generation limit: inside a dataset the chart owns the value (`generations`)
// and hears picks through `generations-change`; on the landing page there is
// none and the row shows the preferred value. Every pick also becomes the
// preference a dataset opens with. Scan cache is the install's, kept by the
// app: the row asks for it each time the popover opens.
@customElement('sl-settings')
export class SettingsElement extends LitElement {
  static override styles = css`
    :host {
      position: relative;
      display: inline-flex;
    }
    button.gear {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 2rem;
      height: 2rem;
      padding: 0;
      background: var(--card);
      color: var(--muted);
      border: 1px solid var(--border);
      border-radius: 6px;
      cursor: pointer;
    }
    button.gear:hover,
    button.gear[aria-expanded='true'] {
      color: var(--accent);
      border-color: var(--accent);
    }
    button.gear svg {
      width: 1rem;
      height: 1rem;
    }
    /* Sized to its content: shrink-to-fit would otherwise measure against the
       gear-sized host it is positioned in. Dropped clear of the top bar (the
       gear sits ~0.7rem above its bottom edge), arrow tip included, so the
       popover floats over the page rather than straddling the bar's border. */
    .popover {
      position: absolute;
      width: max-content;
      top: calc(100% + 1.4rem);
      right: 0;
      z-index: 20;
      display: grid;
      grid-template-columns: auto auto;
      align-items: center;
      gap: 0.75rem 1.25rem;
      padding: 1rem;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 10px;
      box-shadow: 0 8px 24px var(--shadow);
      white-space: nowrap;
    }
    /* The arrow up to the gear: a square turned 45° on the top edge, centred
       under the gear (whose right edge the popover shares). Only its outer two
       sides carry the border, so it reads as part of the popover's outline. */
    .popover::before {
      content: '';
      position: absolute;
      top: -6px;
      right: calc(1rem - 5px);
      width: 10px;
      height: 10px;
      background: var(--card);
      border-top: 1px solid var(--border);
      border-left: 1px solid var(--border);
      transform: rotate(45deg);
    }
    .label {
      font-size: 0.85rem;
      color: var(--muted);
    }
    /* Equal segments, each as wide as the row's longest label; rows stretch
       to the widest so they line up as one column. */
    .segmented {
      display: grid;
      grid-auto-flow: column;
      grid-auto-columns: 1fr;
      gap: 2px;
      padding: 2px;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 7px;
    }
    .segmented button {
      min-width: 2rem;
      padding: 0.3rem 0.65rem;
      background: none;
      color: var(--muted);
      border: 0;
      border-radius: 5px;
      font: inherit;
      font-size: 0.85rem;
      cursor: pointer;
    }
    .segmented button:hover {
      color: var(--accent);
    }
    /* Marked by colour and the raised fill, not weight: a bolder label would
       widen its column, and with it every segment and the popover. */
    .segmented button[aria-pressed='true'] {
      background: var(--card);
      color: var(--fg);
      box-shadow: 0 0 0 1px var(--border);
    }
    /* Under the Scan cache sizes and as wide: a meter of the space used,
       then what it says and Clear at either end. */
    .usage {
      grid-column: 2;
      display: grid;
      gap: 0.5rem;
      margin-top: -0.1rem;
      font-size: 0.8rem;
      color: var(--muted);
    }
    .meter {
      height: 4px;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 3px;
      overflow: hidden;
    }
    .meter div {
      height: 100%;
      background: var(--accent);
    }
    .caption {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
    }
    .caption button {
      padding: 0;
      background: none;
      color: var(--accent);
      border: 0;
      font: inherit;
      cursor: pointer;
    }
    .caption button:hover:not(:disabled) {
      text-decoration: underline;
    }
    .caption button:disabled {
      color: var(--muted);
      opacity: 0.6;
      cursor: default;
    }
  `;

  @property({ attribute: false }) generations: number | null = null;

  @state() private open = false;
  @state() private appearance: Appearance = currentAppearance();
  @state() private preferred = preferredGenerations();
  // Null until the app answers; a string when it couldn't.
  @state() private scanCache: ScanCacheStatus | string | null = null;
  @state() private clearing = false;

  private readonly onDocumentPointerDown = (e: PointerEvent) => {
    if (!e.composedPath().includes(this)) this.open = false;
  };

  private readonly onDocumentKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') this.open = false;
  };

  override updated(changed: PropertyValues) {
    if (changed.has('open') && this.open) void this.askScanCache('GET');
    if (this.open) {
      document.addEventListener('pointerdown', this.onDocumentPointerDown);
      document.addEventListener('keydown', this.onDocumentKeydown);
    } else {
      this.removeListeners();
    }
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.removeListeners();
  }

  private removeListeners() {
    document.removeEventListener('pointerdown', this.onDocumentPointerDown);
    document.removeEventListener('keydown', this.onDocumentKeydown);
  }

  private pickGenerations(n: number) {
    setPreferredGenerations(n);
    this.preferred = n;
    if (this.generations === null || n === this.generations) return;
    this.dispatchEvent(
      new CustomEvent('generations-change', { detail: n, bubbles: true })
    );
  }

  // Every change answers with the cache as it now stands.
  private async askScanCache(method: string, body?: unknown) {
    try {
      const res = await fetch('/settings/scan-cache', {
        method,
        headers: { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      if (!res.ok) throw new Error(await res.text());
      this.scanCache = (await res.json()) as ScanCacheStatus;
    } catch {
      this.scanCache = "Couldn't reach the app";
    }
  }

  private async clearScanCache() {
    this.clearing = true;
    await this.askScanCache('DELETE');
    this.clearing = false;
  }

  private pickAppearance(appearance: Appearance) {
    setAppearance(appearance);
    this.appearance = appearance;
  }

  override render() {
    return html`
      <button
        class="gear"
        title="Settings"
        aria-label="Settings"
        aria-haspopup="true"
        aria-expanded=${this.open}
        @click=${() => {
          this.open = !this.open;
        }}
      >
        ${GEAR_ICON}
      </button>
      ${this.open ? this.renderPopover() : nothing}
    `;
  }

  private renderPopover() {
    return html`
      <div class="popover" role="group" aria-label="Settings">
        ${this.renderAppearance()} ${this.renderGenerations()}
        ${this.renderScanCache()}
      </div>
    `;
  }

  private renderAppearance() {
    return html`
      <span class="label">Appearance</span>
      <div class="segmented">
        ${APPEARANCES.map(
          ({ value, label }) => html`
            <button
              aria-pressed=${value === this.appearance}
              @click=${() => {
                this.pickAppearance(value);
              }}
            >
              ${label}
            </button>
          `
        )}
      </div>
    `;
  }

  // Astia's Images kept on disk: the cap to keep them under, and the space
  // they take now.
  private renderScanCache() {
    const cache = this.scanCache;
    if (cache === null || typeof cache === 'string') {
      return html`
        <span class="label">Scan cache</span>
        <span class="label">${cache ?? 'Asking the app…'}</span>
      `;
    }
    return html`
      <span class="label">Scan cache</span>
      <div class="segmented">
        ${cache.caps.map(
          (cap) => html`
            <button
              aria-pressed=${cap === cache.cap}
              @click=${() => {
                void this.askScanCache('PUT', { cap });
              }}
            >
              ${formatBytes(cap)}
            </button>
          `
        )}
      </div>
      <div class="usage">
        <div class="meter" aria-hidden="true">
          <div
            style="width: ${Math.min(100, (100 * cache.used) / cache.cap)}%"
          ></div>
        </div>
        <div class="caption">
          <span
            >${formatBytes(cache.used)} of ${formatBytes(cache.cap)} used</span
          >
          <button
            ?disabled=${this.clearing || cache.used === 0}
            @click=${() => {
              void this.clearScanCache();
            }}
          >
            Clear
          </button>
        </div>
      </div>
    `;
  }

  private renderGenerations() {
    const current = this.generations ?? this.preferred;
    const values = Array.from({ length: MAX_GENERATIONS }, (_, i) => i + 1);
    return html`
      <span class="label">Generations</span>
      <div class="segmented">
        ${values.map(
          (n) => html`
            <button
              aria-pressed=${n === current}
              @click=${() => {
                this.pickGenerations(n);
              }}
            >
              ${n}
            </button>
          `
        )}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-settings': SettingsElement;
  }
}
