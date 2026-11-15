import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { css, html, LitElement, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';

import { appState } from '@/client/state';
import type { AppState, Exchange, ProposedItem } from '@/client/state';
import { typing } from '@/client/typing';

import { cornerListStyles } from '../corner-panel/list-styles';
import { applyWords, endNote, spendWords, stateWords } from './helpers';

// One question and its answer, as far as it has come.
function renderExchange(e: Exchange, running: boolean) {
  const reading = running && e.answer === '' ? e.reading.at(-1) : undefined;
  const note = endNote(e.ended);
  return html`
    <div class="question">${e.question}</div>
    ${
      reading === undefined
        ? nothing
        : html`<div class="reading">${reading}…</div>`
    }
    ${
      running && e.answer === '' && reading === undefined
        ? html`<div class="reading">Thinking…</div>`
        : nothing
    }
    ${e.answer === '' ? nothing : html`<div class="answer">${e.answer}</div>`}
    ${note === null ? nothing : html`<div class="note">${note}</div>`}
    ${e.failed === null ? nothing : html`<div class="error">${e.failed}</div>`}
  `;
}

// The Assistant tab: the conversation with Claude about the tree, newest
// at the bottom, what it has proposed under it, and a field to ask in. Each question goes with the
// Selected person, the one on screen. While it's answered it shows what
// it's reading, then the answer as it's written; Stop ends it. Enter asks,
// Shift+Enter starts a new line. Each change it proposes is listed, ticked,
// with its reason; Apply writes the ticked ones through the app's own
// operations, and says of each one refused why. New conversation forgets
// this one, Proposal and all.
@customElement('sl-assistant-panel')
class AssistantPanelElement extends SignalWatcher(LitElement) {
  static override styles = [
    cornerListStyles,
    css`
      .log {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 1rem;
        margin: 0 -0.75rem 0.75rem;
        padding: 0 0.75rem;
        font-size: 0.9rem;
      }
      .question {
        align-self: flex-end;
        max-width: 85%;
        padding: 0.4rem 0.65rem;
        border-radius: 10px;
        background: color-mix(in srgb, var(--accent) 18%, transparent);
        white-space: pre-line;
        overflow-wrap: anywhere;
      }
      .answer {
        white-space: pre-line;
        overflow-wrap: anywhere;
        line-height: 1.45;
      }
      .reading {
        color: var(--muted);
        font-size: 0.85em;
      }
      .note {
        color: var(--muted);
        font-size: 0.85em;
        font-style: italic;
      }
      .error {
        color: var(--danger);
        font-size: 0.85em;
      }
      .proposal {
        flex: none;
        max-height: 60%;
        display: flex;
        flex-direction: column;
        margin: 0 0 0.75rem;
        padding: 0.5rem 0.6rem;
        border: 1px solid var(--border);
        border-radius: 8px;
        font-size: 0.85rem;
      }
      .proposal h3 {
        margin: 0 0 0.35rem;
        color: var(--muted);
        font-size: 0.8rem;
        font-weight: 500;
      }
      .proposal ol {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .proposal li {
        padding: 0.25rem 0;
      }
      .proposal label {
        display: flex;
        gap: 0.45rem;
        align-items: baseline;
      }
      .proposal input {
        flex: none;
        margin: 0;
      }
      .proposal .what {
        overflow-wrap: anywhere;
      }
      .proposal .why {
        display: block;
        color: var(--muted);
        font-size: 0.92em;
        line-height: 1.35;
      }
      .proposal .state {
        display: block;
        font-size: 0.92em;
      }
      .proposal li.applied .state {
        color: var(--muted);
      }
      .proposal li.refused .state {
        color: var(--danger);
      }
      .proposal li.withdrawn .what {
        color: var(--muted);
        text-decoration: line-through;
      }
      .proposal .apply-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-top: 0.4rem;
      }
      .proposal .apply-note {
        flex: 1;
        min-width: 0;
        color: var(--muted);
        font-size: 0.92em;
        overflow-wrap: anywhere;
      }
      .proposal .apply-note.failed {
        color: var(--danger);
      }
      textarea {
        display: block;
        width: 100%;
        box-sizing: border-box;
        min-height: 3.5rem;
        margin: 0 0 0.5rem;
        padding: 0.4rem 0.5rem;
        border: 1px solid var(--border);
        border-radius: 6px;
        background: var(--bg);
        color: var(--fg);
        font: inherit;
        font-size: 0.9rem;
        resize: vertical;
      }
      .spent {
        color: var(--muted);
        font-size: 0.8rem;
      }
      button.ask {
        padding: 0.25rem 0.75rem;
        border: 0;
        border-radius: 6px;
        background: var(--accent);
        color: var(--on-accent);
        font-size: 0.85rem;
      }
      button.ask:disabled {
        opacity: 0.5;
        cursor: default;
      }
    `
  ];

  @consume({ context: appState }) private readonly state!: AppState;

  @state() private text = '';

  private ask() {
    const text = this.text.trim();
    if (text === '' || this.state.assistant.busy.get()) return;
    this.text = '';
    void this.state.assistant.ask(text, this.state.selected.id.get());
  }

  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      e.stopPropagation();
      this.ask();
    } else if (typing(e)) {
      e.stopPropagation();
    }
  };

  private renderItem(p: ProposedItem, applying: boolean) {
    const state = stateWords(p.state);
    const kind = typeof p.state === 'object' ? 'refused' : p.state;
    return html`<li class=${kind}>
      <label>
        <input
          type="checkbox"
          .checked=${p.ticked || p.state === 'applied'}
          ?disabled=${p.state !== 'open' || applying}
          @change=${(e: Event) => {
            this.state.assistant.tick(
              p.id,
              (e.target as HTMLInputElement).checked
            );
          }}
        />
        <span>
          <span class="what">${p.label}</span>
          ${p.reason === '' ? nothing : html`<span class="why">${p.reason}</span>`}
          ${state === null ? nothing : html`<span class="state">${state}</span>`}
        </span>
      </label>
    </li>`;
  }

  private renderProposal() {
    const { assistant } = this.state;
    const items = assistant.proposal.get();
    if (items.length === 0) return nothing;
    const applying = assistant.applying.get();
    const ticked = items.filter((p) => p.ticked && p.state === 'open').length;
    const waiting = items.some((p) => p.state === 'open');
    const note = assistant.applyNote.get();
    return html`<section class="proposal" aria-label="Proposal">
      <h3>Proposal</h3>
      <ol>
        ${repeat(
          items,
          (p) => p.id,
          (p) => this.renderItem(p, applying)
        )}
      </ol>
      <div class="apply-row">
        <span
          class="apply-note ${note !== null && 'failed' in note ? 'failed' : ''}"
          >${
            note === null
              ? nothing
              : 'failed' in note
                ? note.failed
                : `A copy of the dataset was saved first: ${note.backup}`
          }</span
        >
        ${
          waiting || applying
            ? html`<button
                class="ask"
                ?disabled=${ticked === 0 || applying || assistant.busy.get()}
                @click=${() => {
                  void assistant.apply();
                }}
              >
                ${applyWords(ticked, applying)}
              </button>`
            : nothing
        }
      </div>
    </section>`;
  }

  override updated() {
    const log = this.renderRoot.querySelector('.log');
    if (log !== null) log.scrollTop = log.scrollHeight;
  }

  override render() {
    const { assistant } = this.state;
    const exchanges = assistant.exchanges.get();
    const busy = assistant.busy.get();
    const spent = spendWords(assistant.spend.get());
    return html`
      <div class="log" aria-live="polite">
        ${
          exchanges.length === 0
            ? html`<p class="muted">
                Ask about the tree: who someone was, what the sources say, where
                people lived. Ask for changes too: they're listed for you to
                tick and apply, and nothing is written before that. The Selected
                person goes with the question. What Claude reads is sent to
                Anthropic; people who may be living are left out unless they're
                on screen.
              </p>`
            : repeat(
                exchanges,
                (_, i) => i,
                (e, i) => renderExchange(e, busy && i === exchanges.length - 1)
              )
        }
      </div>
      ${this.renderProposal()}
      <textarea
        aria-label="Ask the assistant"
        placeholder="Ask about the tree…"
        .value=${this.text}
        @keydown=${this.onKeyDown}
        @input=${(e: Event) => {
          this.text = (e.target as HTMLTextAreaElement).value;
        }}
      ></textarea>
      <div class="actions">
        <button
          class="toggle"
          ?disabled=${exchanges.length === 0}
          @click=${() => {
            void assistant.restart();
          }}
        >
          New conversation
        </button>
        ${spent === null ? nothing : html`<span class="spent">${spent}</span>`}
        ${
          busy
            ? html`<button
                class="ask"
                @click=${() => {
                  assistant.stop();
                }}
              >
                Stop
              </button>`
            : html`<button
                class="ask"
                ?disabled=${this.text.trim() === ''}
                @click=${() => {
                  this.ask();
                }}
              >
                Ask
              </button>`
        }
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-assistant-panel': AssistantPanelElement;
  }
}
