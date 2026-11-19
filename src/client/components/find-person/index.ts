import { css, html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import type { PersonRow } from '@/common/types';

import type { PickEvent } from '../person-search';
import { SEARCH_ICON } from '../person-search/icon';

import '../corner-panel/button';
import '../person-search';

// The chart corner's Find person: a magnifier button beside the lists and
// Settings that turns into the search field when clicked or on ⌘F (Ctrl+F
// elsewhere), and back once someone is picked, Esc is pressed on an empty
// query, or focus moves elsewhere in the window. The field itself, and its
// results, are the person search's; this keeps only whether it shows.
@customElement('sl-find-person')
class FindPersonElement extends LitElement {
  static override styles = css`
    :host {
      display: inline-flex;
    }

    sl-person-search {
      width: min(280px, 40vw);
    }
  `;

  @property({ attribute: false }) persons = new Map<number, PersonRow>();

  @state() private open = false;

  override connectedCallback() {
    super.connectedCallback();
    document.addEventListener('keydown', this.onDocumentKeydown);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this.onDocumentKeydown);
  }

  // ⌘F opens the search in place of the browser's find-in-page, which can't
  // see into the chart's SVG anyway.
  private readonly onDocumentKeydown = (e: KeyboardEvent) => {
    if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return;
    if (e.key.toLowerCase() !== 'f') return;
    e.preventDefault();
    void this.show();
  };

  private async show() {
    this.open = true;
    await this.updateComplete;
    const search = this.renderRoot.querySelector('sl-person-search');
    await search?.updateComplete;
    search?.focusInput();
  }

  private async hide(refocus: boolean) {
    this.open = false;
    if (!refocus) return;
    await this.updateComplete;
    this.renderRoot.querySelector('sl-corner-button')?.focus();
  }

  private readonly onPick = (e: PickEvent) => {
    void this.hide(false);
    this.dispatchEvent(new CustomEvent('pick', { detail: e.detail }));
  };

  // The search clears a query on Esc and lets an empty one's Esc through.
  private readonly onKeydown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return;
    e.preventDefault();
    void this.hide(true);
  };

  // Leaving the window keeps the field and what's typed in it; a click or
  // Tab elsewhere on the page puts the button back.
  private readonly onFocusOut = (e: FocusEvent) => {
    if (!document.hasFocus()) return;
    const to = e.relatedTarget;
    if (to instanceof Node && this.renderRoot.contains(to)) return;
    void this.hide(false);
  };

  override render() {
    return this.open
      ? html`<sl-person-search
          .persons=${this.persons}
          @pick=${this.onPick}
          @keydown=${this.onKeydown}
          @focusout=${this.onFocusOut}
        ></sl-person-search>`
      : html`<sl-corner-button
          label="Find person"
          popup=""
          title="Find person (⌘F)"
          @click=${() => {
            void this.show();
          }}
        >
          ${SEARCH_ICON}
        </sl-corner-button>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-find-person': FindPersonElement;
  }
}
