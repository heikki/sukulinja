import { consume } from '@lit/context';
import { css, html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { ApiError } from '@/client/dataset-api';
import { focusRingStyles } from '@/client/focus-ring';
import { formStyles } from '@/client/form-styles';
import { appState } from '@/client/state';
import type { AppState } from '@/client/state';
import type { CitationRow } from '@/common/types';

// What a source says, its text, and changing it: an Entry's text for
// everyone citing it (ADR-0026), another Citation's its own. What else can
// be done of the source (slot `actions`) sits beside Edit text, and
// is put away while editing.
@customElement('sl-source-text')
class SourceTextElement extends LitElement {
  static override styles = [
    focusRingStyles,
    formStyles,
    css`
      :host {
        display: block;
      }

      .text {
        margin: 0.25rem 0 0;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }

      /* Edit text, and beside it what else can be done. */
      .row {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        column-gap: 1rem;
      }

      button.edit {
        margin-top: 0.4rem;
        padding: 0;
        border: 0;
        background: none;
        color: var(--accent);
        font: inherit;
        cursor: pointer;
      }

      button.edit:hover {
        text-decoration: underline;
      }

      .editing {
        margin-top: 0.4rem;
      }

      textarea {
        display: block;
        width: 100%;
        box-sizing: border-box;
        padding: 0.25rem 0.4rem;
        border: 1px solid var(--border);
        border-radius: 6px;
        background: var(--card);
        color: var(--fg);
        font: inherit;
        line-height: 1.35;
        resize: vertical;
      }

      .hint {
        margin: 0.3rem 0 0;
        color: var(--muted);
        font-size: 0.85rem;
      }
    `
  ];

  @consume({ context: appState }) private readonly state!: AppState;

  @property({ attribute: false }) citation!: CitationRow;
  // The source's heading: a text saying only that isn't shown again.
  @property() heading = '';

  @state() private draft: string | null = null;
  @state() private saving = false;
  @state() private error: string | null = null;

  private edit(text: string | null) {
    this.draft = text;
    this.error = null;
    if (text === null) return;
    void this.updateComplete.then(() => {
      this.renderRoot.querySelector('textarea')?.focus();
    });
  }

  private async save() {
    if (this.saving || this.draft === null) return;
    this.saving = true;
    this.error = null;
    try {
      await this.state.selected.retext(this.citation.id, this.draft);
      this.draft = null;
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      this.error = err.message;
    } finally {
      this.saving = false;
    }
  }

  private renderEditing(draft: string) {
    const shared = this.citation.entryId !== null;
    return html`<div class="editing">
      <textarea
        rows="4"
        aria-label="Text"
        .value=${draft}
        @input=${(e: Event) => {
          this.draft = (e.target as HTMLTextAreaElement).value;
        }}
        @keydown=${(e: KeyboardEvent) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            this.edit(null);
          }
        }}
      ></textarea>
      ${
        shared
          ? html`<p class="hint">Everyone in the entry shares this text.</p>`
          : nothing
      }
      ${this.error === null ? nothing : html`<p class="error">${this.error}</p>`}
      <div class="buttons end">
        <button
          ?disabled=${this.saving}
          @click=${() => {
            this.edit(null);
          }}
        >
          Cancel
        </button>
        <button
          class="primary"
          ?disabled=${this.saving}
          @click=${() => {
            void this.save();
          }}
        >
          ${this.saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>`;
  }

  override render() {
    if (this.draft !== null) return this.renderEditing(this.draft);
    const { text, page } = this.citation;
    const shown = text ?? page;
    return html`
      ${
        shown === null || shown === this.heading
          ? nothing
          : html`<p class="text">${shown}</p>`
      }
      <div class="row">
        <button
          class="edit"
          @click=${() => {
            this.edit(text ?? '');
          }}
        >
          ${text === null ? 'Add text' : 'Edit text'}
        </button>
        <slot name="actions"></slot>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-source-text': SourceTextElement;
  }
}
