import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { css, html, LitElement, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import { ApiError } from '@/client/dataset-api';
import { focusRingStyles } from '@/client/focus-ring';
import { appState } from '@/client/state';
import type { AppState } from '@/client/state';

import { openSuggestions } from './helpers';

// Confirming at once the support the person's Transcriptions suggest where
// they agree with the Fact: each a support of its own, and a Change. One
// that differs is confirmed from its source, where it can be read.
@customElement('sl-confirm-suggestions')
class ConfirmSuggestionsElement extends SignalWatcher(LitElement) {
  static override styles = [
    focusRingStyles,
    css`
      :host {
        display: block;
      }

      button {
        margin-bottom: 0.5rem;
        padding: 0;
        border: 0;
        background: none;
        color: var(--accent);
        font: inherit;
        cursor: pointer;
      }

      button:hover:not(:disabled) {
        text-decoration: underline;
      }

      button:disabled {
        color: var(--muted);
        cursor: default;
      }

      .error {
        margin: 0.3rem 0 0;
        color: var(--danger);
        font-size: 0.85rem;
      }
    `
  ];

  @consume({ context: appState }) private readonly state!: AppState;

  @state() private saving = false;
  @state() private refused: string | null = null;

  // Each agreeing suggestion, by its Citation.
  private agreeing() {
    const d = this.state.selected.details.get();
    if (d === null) return [];
    return d.citations.flatMap((c) =>
      openSuggestions(c, d.facts)
        .filter((s) => s.agrees === true)
        .map((s) => ({ citationId: c.id, factId: s.factId }))
    );
  }

  private async confirm() {
    if (this.saving) return;
    this.saving = true;
    this.refused = null;
    try {
      for (const { citationId, factId } of this.agreeing()) {
        // eslint-disable-next-line no-await-in-loop -- one at a time, so each Citation comes back as the last one left it
        await this.state.selected.support(citationId, factId, true);
      }
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      this.refused = err.message;
    } finally {
      this.saving = false;
    }
  }

  override render() {
    const n = this.agreeing().length;
    if (n === 0 && this.refused === null) return nothing;
    return html`
      ${
        n === 0
          ? nothing
          : html`<button
              ?disabled=${this.saving}
              @click=${() => {
                void this.confirm();
              }}
            >
              ${
                n === 1
                  ? 'Confirm the agreeing suggestion'
                  : `Confirm ${n} agreeing suggestions`
              }
            </button>`
      }
      ${
        this.refused === null
          ? nothing
          : html`<p class="error">${this.refused}</p>`
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-confirm-suggestions': ConfirmSuggestionsElement;
  }
}
