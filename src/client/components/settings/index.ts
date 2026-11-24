import { consume } from '@lit/context';
import { css, html, LitElement, nothing, svg } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { currentAppearance, setAppearance } from '@/client/appearance';
import type { Appearance } from '@/client/appearance';
import { assistantOn, setAssistantOn } from '@/client/assistant-flag';
import { ApiError } from '@/client/dataset-api';
import type { AppApi } from '@/client/dataset-api/app';
import { dialogStyles } from '@/client/dialog-styles';
import { focusRingStyles } from '@/client/focus-ring';
import {
  MAX_GENERATIONS,
  preferredGenerations,
  setPreferredGenerations
} from '@/client/generations';
import { pageNumbersOn, setPageNumbersOn } from '@/client/page-numbers-flag';
import { appApi } from '@/client/state';
import type { StorageStatus } from '@/common/types';

import { CornerPopover, popoverStyles } from '../corner-panel/popover';
import { capDrop, clearDrop, formatBytes } from './helpers';
import { OFF_ON, rowStyles, segmented } from './segmented';

import './assistant-choices';
import './assistant-key';
import './offload-folder';
import type { StorageDrop } from './helpers';

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

// The gear in the window's top-right corner (beside the person search inside a
// dataset) and the popover it opens. Inside a dataset it first names the dataset
// (`datasetName`) and links back to the chooser. Non-modal, so the chart
// stays in view and reflows as Generations changes; a click anywhere
// outside, the gear again, or Escape closes it. Generations is the chart's
// Generation limit: inside a dataset the chart owns the value (`generations`)
// and hears picks through `generations-change`; on the landing page there is
// none and the row shows the preferred value. Every pick also becomes the
// preference a dataset opens with. Storage is the install's, kept by the
// app: the row asks for it each time the popover opens. Anything that would
// remove downloaded scans, Clear or a cap below the space used, asks to
// confirm in a dialog first, naming how much goes.
@customElement('sl-settings')
class SettingsElement extends LitElement {
  static override styles = [
    focusRingStyles,
    dialogStyles,
    popoverStyles,
    rowStyles,
    css`
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
       gear-sized host it is positioned in. */
      .popover {
        width: max-content;
        display: grid;
        grid-template-columns: auto auto;
        align-items: center;
        gap: 0.75rem 1.25rem;
        white-space: nowrap;
      }
      /* Lines across both columns, setting the Assistant's rows apart. */
      .rule {
        grid-column: 1 / -1;
        align-self: stretch;
        height: 0;
        margin: 0.25rem 0;
        border: 0;
        border-top: 1px solid var(--border);
      }
      /* Beside a row of lines, level with its first. */
      .label.top {
        align-self: start;
      }
      .dataset {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 1.25rem;
        font-size: 0.85rem;
      }
      .dataset .name {
        font-weight: 600;
      }
      .dataset a {
        color: var(--accent);
        text-decoration: none;
      }
      .dataset a:hover {
        text-decoration: underline;
      }
      /* Under Storage sizes and as wide: a meter of the space used,
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
      /* The confirming dialog dims the popover too. */
      .overlay {
        z-index: 21;
      }
      .caption button:disabled {
        color: var(--muted);
        opacity: 0.6;
        cursor: default;
      }
    `
  ];

  @consume({ context: appApi }) private readonly app!: AppApi;

  @property({ attribute: false }) generations: number | null = null;
  @property({ attribute: false }) datasetName: string | null = null;

  @state() private appearance: Appearance = currentAppearance();
  @state() private preferred = preferredGenerations();
  // Null until the app answers; a string when it couldn't.
  @state() private storage: StorageStatus | string | null = null;
  // The removal the dialog is asking to confirm, if it's up.
  @state() private confirming: StorageDrop | null = null;
  @state() private dropping = false;

  // Closed by another popover opening, a press outside or Esc, which
  // takes down the confirming dialog first.
  private readonly corner = new CornerPopover(this, () => {
    if (this.confirming === null) this.corner.set(false);
    else this.cancelDrop();
  });

  private get open() {
    return this.corner.open;
  }

  private pickGenerations(n: number) {
    setPreferredGenerations(n);
    this.preferred = n;
    if (this.generations === null || n === this.generations) return;
    this.dispatchEvent(
      new CustomEvent('generations-change', { detail: n, bubbles: true })
    );
  }

  // Every ask answers with Storage as it now stands; a refusal shows in
  // its place.
  private async askStorage(asked: () => Promise<StorageStatus>) {
    try {
      this.storage = await asked();
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      this.storage = err.message;
    }
  }

  private setCap(cap: number) {
    return this.askStorage(async () => await this.app.setStorageCap(cap));
  }

  // A cap that keeps everything on disk is saved at once; one that would
  // drop scans asks first.
  private pickCap(cache: StorageStatus, cap: number) {
    const drop = capDrop(cache.used, cap);
    if (drop === null) void this.setCap(cap);
    else this.confirming = drop;
  }

  private cancelDrop() {
    if (!this.dropping) this.confirming = null;
  }

  private async confirmDrop(drop: StorageDrop) {
    this.dropping = true;
    if (drop.kind === 'clear') {
      await this.askStorage(this.app.clearStorage);
    } else await this.setCap(drop.cap);
    this.dropping = false;
    this.confirming = null;
  }

  private pickAppearance(appearance: Appearance) {
    setAppearance(appearance);
    this.appearance = appearance;
  }

  override render() {
    return html`
      <button
        class="gear"
        aria-label="Settings"
        aria-haspopup="true"
        aria-expanded=${this.open}
        @click=${() => {
          this.corner.set(!this.open);
          if (this.open) void this.askStorage(this.app.storage);
        }}
      >
        ${GEAR_ICON}
      </button>
      ${this.open ? this.renderPopover() : nothing}
      ${
        this.confirming === null
          ? nothing
          : this.renderDropDialog(this.confirming)
      }
    `;
  }

  private renderDropDialog(drop: StorageDrop) {
    const clear = drop.kind === 'clear';
    return html`
      <div
        class="overlay"
        @click=${() => {
          this.cancelDrop();
        }}
      >
        <div
          class="dialog"
          role="alertdialog"
          aria-labelledby="drop-title"
          @click=${(e: Event) => {
            e.stopPropagation();
          }}
        >
          <h2 id="drop-title">
            ${
              clear
                ? 'Clear storage?'
                : `Lower the cap to ${formatBytes(drop.cap)}?`
            }
          </h2>
          <p>
            ${
              clear
                ? html`All <strong>${formatBytes(drop.bytes)}</strong> of
                    downloaded scans will be
                    removed.${
                      drop.kept > 0
                        ? ' The cited ones offloaded volumes keep stay.'
                        : ''
                    }`
                : html`About <strong>${formatBytes(drop.bytes)}</strong> of
                    downloaded scans, the least recently viewed, will be removed
                    to fit.`
            }
            They download again from Astia when opened.
          </p>
          <div class="actions">
            <button
              @click=${() => {
                this.cancelDrop();
              }}
              ?disabled=${this.dropping}
            >
              Cancel
            </button>
            <button
              class="danger"
              @click=${() => {
                void this.confirmDrop(drop);
              }}
              ?disabled=${this.dropping}
            >
              ${this.dropping ? 'Removing…' : clear ? 'Clear' : 'Lower cap'}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private renderPopover() {
    return html`
      <div class="popover" role="group" aria-label="Settings">
        ${this.renderDataset()} ${this.renderAppearance()}
        ${this.renderGenerations()}
        <hr class="rule" />
        ${this.renderStorage()}
        <span class="label top">Offload folder</span>
        <sl-offload-folder></sl-offload-folder>
        <hr class="rule" />
        ${this.renderPageNumbers()} ${this.renderAssistant()}
      </div>
    `;
  }

  // Off or on while the Assistant is tried out (assistant-flag.ts); on, its
  // key, model and answer style below. Lines above and below set it apart.
  private renderAssistant() {
    const on = assistantOn.get();
    return html`
      <hr class="rule" />
      <span class="label">Assistant</span>
      ${segmented('Assistant', OFF_ON, on, (value) => {
        setAssistantOn(value);
        this.requestUpdate();
      })}
      ${
        on
          ? html`<span></span><sl-assistant-key></sl-assistant-key>
              <sl-assistant-choices></sl-assistant-choices>`
          : nothing
      }
      <hr class="rule" />
    `;
  }

  // Off or on for the page each Image is counted as, over the scan, for
  // checking a page survey (page-numbers-flag.ts).
  private renderPageNumbers() {
    return html`
      <span class="label">Page numbers</span>
      ${segmented('Page numbers', OFF_ON, pageNumbersOn.get(), (value) => {
        setPageNumbersOn(value);
        this.requestUpdate();
      })}
    `;
  }

  private renderDataset() {
    if (this.datasetName === null) return nothing;
    return html`
      <span class="label">Dataset</span>
      <div class="dataset">
        <span class="name">${this.datasetName}</span>
        <a href="/">All datasets</a>
      </div>
    `;
  }

  private renderAppearance() {
    return html`
      <span class="label">Appearance</span>
      ${segmented('Appearance', APPEARANCES, this.appearance, (value) => {
        this.pickAppearance(value);
      })}
    `;
  }

  // Astia's Images kept on disk: the cap to keep them under, and the space
  // they take now.
  private renderStorage() {
    const cache = this.storage;
    if (cache === null || typeof cache === 'string') {
      return html`
        <span class="label">Scans on disk</span>
        <span class="label">${cache ?? 'Asking the app…'}</span>
      `;
    }
    return html`
      <span class="label">Scans on disk</span>
      <div
        class="segmented"
        title="Kept under this; the least recently viewed go first"
      >
        ${cache.caps.map(
          (cap) => html`
            <button
              aria-pressed=${cap === cache.cap}
              @click=${() => {
                this.pickCap(cache, cap);
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
            ?disabled=${clearDrop(cache) === null}
            @click=${() => {
              this.confirming = clearDrop(cache);
            }}
          >
            Remove all…
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
