import { css, html, LitElement, nothing } from 'lit';
import type { PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { focusRingStyles } from '@/client/focus-ring';

import { suggestionsFor } from './suggest';

const MAX_SUGGESTIONS = 8;

// One line of text, as a form's place: it wraps and grows as long as what's
// written, and offers the `suggestions` that hold the words typed, below it,
// while typing. Arrows go through them, Enter or a click takes one, Esc
// puts them away; otherwise Enter and Esc are the form's. It says `input`
// as its value changes, a newline never being part of it.
@customElement('sl-line-field')
class LineFieldElement extends LitElement {
  static override shadowRootOptions = {
    ...LitElement.shadowRootOptions,
    delegatesFocus: true
  };

  static override styles = [
    focusRingStyles,
    css`
      :host {
        display: block;
        min-width: 0;
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
        line-height: 1.3;
        resize: none;
        overflow: hidden;
      }

      .suggestions {
        margin-top: 2px;
        border: 1px solid var(--border);
        border-radius: 6px;
        background: var(--card);
        overflow: hidden;
      }

      .suggestions button {
        display: block;
        width: 100%;
        padding: 0.3rem 0.4rem;
        border: 0;
        border-bottom: 1px solid var(--border);
        background: transparent;
        color: var(--fg);
        font: inherit;
        font-size: 0.85rem;
        text-align: left;
        cursor: pointer;
      }

      .suggestions button:last-child {
        border-bottom: 0;
      }

      .suggestions button[aria-selected='true'],
      .suggestions button:hover {
        background: color-mix(in srgb, var(--accent) 18%, transparent);
      }
    `
  ];

  @property() value = '';
  @property() placeholder = '';
  @property({ attribute: false }) suggestions: readonly string[] = [];

  // Whether the suggestions are out: from typing until one is taken, Esc,
  // or the field is left.
  @state() private suggesting = false;
  // The suggestion the arrows are on; -1 for none, so Enter is the form's.
  @state() private active = -1;

  private shown() {
    return this.suggesting
      ? suggestionsFor(this.value, this.suggestions, MAX_SUGGESTIONS)
      : [];
  }

  private say(value: string) {
    this.value = value;
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  }

  private take(choice: string) {
    this.suggesting = false;
    this.active = -1;
    this.say(choice);
  }

  private readonly onInput = (e: Event) => {
    e.stopPropagation();
    const typed = (e.target as HTMLTextAreaElement).value;
    this.suggesting = true;
    this.active = -1;
    this.say(typed.replace(/\s*\n\s*/gu, ' '));
  };

  private readonly onKeydown = (e: KeyboardEvent) => {
    if (e.isComposing) return;
    if (this.steer(e.key)) {
      e.preventDefault();
      e.stopPropagation();
    } else if (e.key === 'Enter') {
      // No newline; the form's Enter saves.
      e.preventDefault();
    }
  };

  // Whether the key was the suggestions': Enter on one takes it, Esc puts
  // them away, the arrows go through them.
  private steer(key: string) {
    const shown = this.shown();
    if (shown.length === 0) return false;
    const chosen = shown[this.active];
    if (key === 'Enter' && chosen !== undefined) {
      this.take(chosen);
    } else if (key === 'Escape') {
      this.suggesting = false;
      this.active = -1;
    } else if (key === 'ArrowDown') {
      this.active = Math.min(this.active + 1, shown.length - 1);
    } else if (key === 'ArrowUp') {
      this.active = Math.max(this.active - 1, -1);
    } else {
      return false;
    }
    return true;
  }

  // As tall as its lines.
  override updated(changed: PropertyValues) {
    if (!changed.has('value') && !changed.has('placeholder')) return;
    const field = this.renderRoot.querySelector('textarea');
    if (field === null) return;
    field.style.height = 'auto';
    field.style.height = `${field.scrollHeight + field.offsetHeight - field.clientHeight}px`;
  }

  override render() {
    const shown = this.shown();
    return html`<textarea
        rows="1"
        autocomplete="off"
        spellcheck="false"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded=${shown.length > 0 ? 'true' : 'false'}
        placeholder=${this.placeholder}
        .value=${this.value}
        @input=${this.onInput}
        @keydown=${this.onKeydown}
        @blur=${() => {
          this.suggesting = false;
          this.active = -1;
        }}
      ></textarea>
      ${
        shown.length === 0
          ? nothing
          : html`<div
              class="suggestions"
              role="listbox"
              @mousedown=${(e: MouseEvent) => {
                // Focus stays in the field, where the keys are handled.
                e.preventDefault();
              }}
            >
              ${shown.map(
                (s, i) =>
                  html`<button
                    role="option"
                    tabindex="-1"
                    aria-selected=${i === this.active ? 'true' : 'false'}
                    @click=${() => {
                      this.take(s);
                    }}
                  >
                    ${s}
                  </button>`
              )}
            </div>`
      }`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-line-field': LineFieldElement;
  }
}
