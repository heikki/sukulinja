import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { css, html, LitElement, nothing } from 'lit';
import { customElement } from 'lit/decorators.js';

import { appState } from '@/client/state';
import type { AppState } from '@/client/state';

import { controlStyles } from '../box-stage/styles';
import { batchFoundWords, costWords, modelLabel } from './vision-words';

function stop(e: Event) {
  e.stopPropagation();
}

// Along the top of the stage, while Vision Match locates the estimates on
// the Image, and after (ADR-0029): how long it has been at it, then what
// it found and what that took, or why it couldn't, until closed.
@customElement('sl-scan-vision')
class ScanVisionElement extends SignalWatcher(LitElement) {
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
        pointer-events: none;
      }

      .card {
        display: flex;
        align-items: flex-start;
        gap: 1rem;
        max-width: 32rem;
        padding: 0.7rem 0.9rem 0.7rem 1.1rem;
        border-radius: 0.6rem;
        background: var(--card);
        color: var(--fg);
        box-shadow: 0 2px 12px rgb(0 0 0 / 0.25);
        pointer-events: auto;
      }

      p {
        margin: 0;
      }

      .cost {
        margin-top: 0.25rem;
        color: var(--muted);
        font-size: 0.8rem;
      }

      .refused {
        color: var(--danger);
      }

      .actions {
        display: flex;
        gap: 0.4rem;
        flex-shrink: 0;
      }
    `
  ];

  @consume({ context: appState }) private readonly state!: AppState;

  // Ticks the seconds while it searches.
  private timer: ReturnType<typeof setInterval> | null = null;

  override connectedCallback() {
    super.connectedCallback();
    for (const type of ['mousedown', 'wheel', 'dblclick', 'contextmenu']) {
      this.addEventListener(type, stop);
    }
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.tick(false);
  }

  private tick(on: boolean) {
    if (on && this.timer === null) {
      this.timer = setInterval(() => {
        this.requestUpdate();
      }, 1000);
    } else if (!on && this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private renderClose() {
    return html`<button
      @click=${() => {
        this.state.viewer.forgetVisionBatch();
      }}
    >
      Close
    </button>`;
  }

  private renderUndo() {
    return html`<button
      title="Takes back every Match it found"
      @click=${async () => {
        await this.state.viewer.undoVisionBatch();
      }}
    >
      Undo all
    </button>`;
  }

  // How long it has been at it, then how many it found and what it took.
  // The ones not found stay under Estimate beside the scan.
  override render() {
    const batch = this.state.viewer.visionBatch.get();
    this.tick(batch !== null && 'searching' in batch);
    if (batch === null) return nothing;
    if ('searching' in batch) {
      const seconds = Math.round((Date.now() - batch.since) / 1000);
      return html`<div class="card">
        <p>
          Vision Match is locating ${batch.of} with
          ${modelLabel(batch.searching)}… ${seconds} s
        </p>
      </div>`;
    }
    const tries = batch.tries.map((t) => t.tried);
    const found = tries.some((t) => t.missed === null);
    return html`<div class="card">
      <div>
        ${
          batch.refused === null
            ? html`<p>
                ${batchFoundWords(tries, batch.of, this.state.viewer.image.get())}
              </p>`
            : html`<p class="refused">${batch.refused}</p>`
        }
        ${
          batch.took === null
            ? nothing
            : html`<p class="cost">${costWords(batch.took)}</p>`
        }
      </div>
      <div class="actions">
        ${found ? this.renderUndo() : nothing} ${this.renderClose()}
      </div>
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-scan-vision': ScanVisionElement;
  }
}
