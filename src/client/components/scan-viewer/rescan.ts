import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { css, html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { ApiError } from '@client/dataset-api';
import { appState } from '@client/state';
import type { AppState } from '@client/state';

import { staleLines } from './stale-lines';
import { controlStyles } from './styles';

// The pins switching leaves out, shown before the rest are folded.
const SHOWN = 5;

function stop(e: Event) {
  e.stopPropagation();
}

// Along the top of the stage, when the Volume shown turns out to be
// re-scanned: what switching to Astia's new filming leaves
// out, and the choice to switch. `retry` loads the Image again once
// switched.
@customElement('sl-scan-rescan')
export class ScanRescanElement extends SignalWatcher(LitElement) {
  static override styles = [
    controlStyles,
    css`
      /* Along the top of the stage, leaving the rest to pan. */
      :host {
        position: absolute;
        inset: 0 0 auto;
        display: flex;
        justify-content: center;
        padding: 0.6rem 1rem 0;
      }

      .card {
        max-width: 28rem;
        padding: 1rem 1.2rem;
        border-radius: 0.6rem;
        background: var(--card);
        color: var(--fg);
        box-shadow: 0 2px 12px rgb(0 0 0 / 0.25);
      }

      p {
        margin: 0 0 0.6rem;
      }

      ul {
        margin: 0 0 0.8rem;
        padding-left: 1.2rem;
        color: var(--muted);
      }

      .actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
      }

      button.save {
        border-color: var(--accent);
        background: var(--accent);
        color: var(--bg);
      }

      button.save:hover:not(:disabled) {
        color: var(--bg);
        filter: brightness(1.1);
      }

      .refused {
        color: var(--danger);
        font-size: 0.8rem;
      }
    `
  ];

  @consume({ context: appState }) private readonly state!: AppState;

  // The dataset's people, who name the citations.
  private get persons() {
    return this.state.chart.people.get().persons;
  }
  @property({ attribute: false }) retry: (() => void) | null = null;

  @state() private switching = false;
  @state() private refused: string | null = null;
  @state() private unfolded = false;

  override connectedCallback() {
    super.connectedCallback();
    for (const type of ['mousedown', 'wheel', 'dblclick', 'contextmenu']) {
      this.addEventListener(type, stop);
    }
  }

  private readonly onSwitch = async () => {
    this.switching = true;
    this.refused = null;
    try {
      await this.state.viewer.switchFilming();
      this.retry?.();
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      this.refused = err.message;
    } finally {
      this.switching = false;
    }
  };

  private renderLeftOut(lines: string[]) {
    if (lines.length === 0) {
      return html`<p>Nothing pinned in it was made on the old photographs.</p>`;
    }
    const shown = this.unfolded ? lines : lines.slice(0, SHOWN);
    const more = lines.length - shown.length;
    return html`
      <p>Made on the old photographs, and left out after switching:</p>
      <ul>
        ${shown.map((line) => html`<li>${line}</li>`)}
        ${
          more === 0
            ? nothing
            : html`<li>
                <button
                  class="plain"
                  @click=${() => {
                    this.unfolded = true;
                  }}
                >
                  and ${more} more
                </button>
              </li>`
        }
      </ul>
    `;
  }

  override render() {
    const { viewer } = this.state;
    const rescan = viewer.rescan.get();
    if (rescan === null) return nothing;
    const rows = viewer.citations.get();
    const lines = staleLines(
      rescan.stale,
      Array.isArray(rows) ? rows : [],
      this.persons
    );
    return html`
      <div class="card">
        <p>
          Astia has replaced this Volume's scans with a new filming
          (${rescan.cached} → ${rescan.images} Images).
        </p>
        ${this.renderLeftOut(lines)}
        ${
          this.refused === null
            ? nothing
            : html`<p class="refused">${this.refused}</p>`
        }
        <div class="actions">
          <button
            ?disabled=${this.switching}
            @click=${() => {
              viewer.keepFilming();
            }}
          >
            Not now
          </button>
          <button
            class="save"
            ?disabled=${this.switching}
            @click=${this.onSwitch}
          >
            ${this.switching ? 'Switching…' : 'Use the new filming'}
          </button>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-scan-rescan': ScanRescanElement;
  }
}
