import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { css, html, LitElement, nothing } from 'lit';
import { customElement } from 'lit/decorators.js';

import { appState } from '@/client/state';
import type { AppState } from '@/client/state';

import { controlStyles } from '../box-stage/styles';
import { costWords, foundWords, modelLabel } from './vision-words';

function stop(e: Event) {
  e.stopPropagation();
}

// Along the top of the stage, while Vision Match searches for the source
// and after (ADR-0029): how long it has been at it, then what it found and
// what that took, or why it couldn't, until closed.
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
        this.state.viewer.forgetVisionMatch();
      }}
    >
      Close
    </button>`;
  }

  override render() {
    const status = this.state.viewer.visionMatch.get();
    this.tick(status !== null && 'searching' in status);
    if (status === null) return nothing;
    if ('searching' in status) {
      const seconds = Math.round((Date.now() - status.since) / 1000);
      return html`<div class="card">
        <p>
          Vision Match is searching with ${modelLabel(status.searching)}…
          ${seconds} s
        </p>
      </div>`;
    }
    if ('refused' in status) {
      return html`<div class="card">
        <p class="refused">${status.refused}</p>
        ${this.renderClose()}
      </div>`;
    }
    return html`<div class="card">
      <div>
        <p>${foundWords(status.tried)}</p>
        <p class="cost">${costWords(status.tried)}</p>
      </div>
      ${this.renderClose()}
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-scan-vision': ScanVisionElement;
  }
}
