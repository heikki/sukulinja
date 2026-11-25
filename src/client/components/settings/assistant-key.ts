import { consume } from '@lit/context';
import { css, html, LitElement } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import { Asking } from '@/client/asking';
import type { AppApi } from '@/client/dataset-api/app';
import { focusRingStyles } from '@/client/focus-ring';
import { appApi } from '@/client/state';
import type { AssistantKeyStatus } from '@/common/types';

import { knownOf } from './known';

// Settings' Assistant row: whether the assistant has an Anthropic API key,
// a field to give one, and Remove for the one kept. The key goes to the
// system's credential store and is never shown again. Asked for each time
// the row is drawn, as Settings opens, drawn meanwhile as it last stood.
@customElement('sl-assistant-key')
class AssistantKeyElement extends LitElement {
  static override styles = [
    focusRingStyles,
    css`
      :host {
        display: grid;
        gap: 0.4rem;
        font-size: 0.85rem;
      }
      .row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
      }
      .muted {
        color: var(--muted);
      }
      .error {
        color: var(--danger);
        white-space: normal;
      }
      input {
        flex: 1;
        min-width: 0;
        padding: 0.25rem 0.4rem;
        border: 1px solid var(--border);
        border-radius: 6px;
        background: var(--card);
        color: var(--fg);
        font: inherit;
      }
      button {
        padding: 0;
        background: none;
        color: var(--accent);
        border: 0;
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
    `
  ];

  @consume({ context: appApi }) private readonly app!: AppApi;

  private readonly asking = new Asking(this);

  // Null until the app answers.
  @state() private status: AssistantKeyStatus | null = null;
  @state() private typed = '';

  override connectedCallback() {
    super.connectedCallback();
    this.status = knownOf(this.app).key ?? null;
    void this.ask(this.app.assistantKey);
  }

  // Every ask answers with the status as it then stands.
  private async ask(asked: () => Promise<AssistantKeyStatus>) {
    await this.asking.run(async () => {
      const status = await asked();
      this.status = status;
      knownOf(this.app).key = status;
      this.typed = '';
    });
  }

  private readonly save = (e: Event) => {
    e.preventDefault();
    const key = this.typed;
    if (key.trim() === '') return;
    void this.ask(async () => await this.app.setAssistantKey(key));
  };

  override render() {
    const status = this.status;
    if (status === null) {
      return html`<span class="muted"
        >${this.asking.refused ?? 'Asking the app…'}</span
      >`;
    }
    if (status.source === 'saved') {
      return html`
        <div class="row">
          <span>API key saved</span>
          <button
            ?disabled=${this.asking.busy}
            @click=${() => {
              void this.ask(this.app.removeAssistantKey);
            }}
          >
            Remove
          </button>
        </div>
        ${this.renderError()}
      `;
    }
    return html`
      <form class="row" @submit=${this.save}>
        <input
          type="password"
          aria-label="Anthropic API key"
          placeholder="Anthropic API key"
          autocomplete="off"
          .value=${this.typed}
          @input=${(e: Event) => {
            this.typed = (e.target as HTMLInputElement).value;
          }}
        />
        <button
          type="submit"
          ?disabled=${this.asking.busy || this.typed.trim() === ''}
        >
          Save
        </button>
      </form>
      ${
        status.source === 'environment'
          ? html`<span class="muted"
              >Using the environment's key until then</span
            >`
          : html`<span class="muted">Kept in the system's key store</span>`
      }
      ${this.renderError()}
    `;
  }

  private renderError() {
    return this.asking.refused === null
      ? null
      : html`<span class="error">${this.asking.refused}</span>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-assistant-key': AssistantKeyElement;
  }
}
