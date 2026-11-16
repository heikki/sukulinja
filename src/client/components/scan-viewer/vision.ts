import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { css, html, LitElement, nothing } from 'lit';
import { customElement } from 'lit/decorators.js';

import { appState } from '@/client/state';
import type { AppState } from '@/client/state';
import { missedOf } from '@/client/state/vision-batch';
import type { VisionBatch } from '@/client/state/vision-batch';
import type { VisionTry } from '@/common/types';

type Done = Exclude<VisionBatch, { searching: unknown }>;

import { controlStyles } from '../box-stage/styles';
import { rowName } from './citations';
import {
  batchFoundWords,
  costWords,
  modelLabel,
  surveyWords,
  volumeFoundWords
} from './vision-words';

function stop(e: Event) {
  e.stopPropagation();
}

// Along the top of the stage, while Vision Match locates the estimates on
// the Image or in the Volume, and after (ADR-0029, ADR-0032): how long it
// has been at it and at what, then what it found and what that took, or
// why it couldn't, until closed.
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

      .missed {
        margin: 0.5rem 0 0;
        padding: 0;
        max-height: 12rem;
        overflow-y: auto;
        list-style: none;
        font-size: 0.85rem;
      }

      .missed button {
        display: block;
        width: 100%;
        padding: 0.2rem 0.4rem;
        border: 0;
        border-radius: 0.3rem;
        background: none;
        color: var(--fg);
        font: inherit;
        text-align: left;
        cursor: pointer;
      }

      .missed button:hover:not(:disabled) {
        background: color-mix(in srgb, var(--fg) 8%, transparent);
        color: var(--fg);
      }

      .missed .why {
        color: var(--muted);
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

  private foundWords(
    tries: VisionTry[],
    batch: Pick<Done, 'scope' | 'of' | 'survey'>
  ) {
    switch (batch.scope) {
      case 'image':
        return batchFoundWords(tries, batch.of, this.state.viewer.image.get());
      case 'volume':
        return volumeFoundWords(tries, batch.of, batch.survey);
      case 'survey':
        return batch.survey === null ? '' : surveyWords(batch.survey);
    }
  }

  // The references a Volume's batch didn't find, with why, each opening
  // its reference where it's estimated.
  private renderMissed(batch: Done) {
    if (batch.scope !== 'volume') return nothing;
    const missed = missedOf(batch.tries);
    if (missed.length === 0) return nothing;
    const { persons } = this.state.chart.people.get();
    return html`<ul class="missed">
      ${missed.map(({ row, why }) => {
        const at =
          row.link.precision === 'volume' ? '' : ` · Image ${row.link.image}`;
        return html`<li>
          <button
            @click=${() => {
              this.state.chart.pick(row);
            }}
          >
            ${rowName(persons, row)}<span class="why">${at} · ${why}</span>
          </button>
        </li>`;
      })}
    </ul>`;
  }

  // How long it has been at it, then how many it found and what it took.
  // The ones not found stay under Estimate beside the scan.
  override render() {
    const batch = this.state.viewer.visionBatch.get();
    this.tick(batch !== null && 'searching' in batch);
    if (batch === null) return nothing;
    if ('searching' in batch) {
      const seconds = Math.round((Date.now() - batch.since) / 1000);
      const step = batch.step === null ? '' : `, ${batch.step}`;
      return html`<div class="card">
        <p>
          ${
            batch.of === 0
              ? `Vision Match with ${modelLabel(batch.searching)}${step}`
              : `Vision Match is locating ${batch.of} with ${modelLabel(batch.searching)}${step}`
          }…
          ${seconds} s
        </p>
      </div>`;
    }
    const tries = batch.tries.map((t) => t.tried);
    const found = tries.some((t) => t.missed === null);
    return html`<div class="card">
      <div>
        ${
          batch.refused === null
            ? html`<p>${this.foundWords(tries, batch)}</p>
                ${this.renderMissed(batch)}`
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
