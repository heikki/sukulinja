import { css, html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { reducedMotion } from '@/client/pan-zoom';
import type { PersonRow } from '@/common/types';

import type { PickEvent } from '../person-search';
import { SEARCH_ICON } from '../person-search/icon';

import '../corner-panel/button';
import '../person-search';

const MORPH_MS = 200;
// Ease-out cubic, as the dock and the folds slide.
const EASING = 'cubic-bezier(0.33, 1, 0.68, 1)';

// The chart corner's Find person: a magnifier button beside the lists and
// Settings that turns into the search field when clicked or on ⌘F (Ctrl+F
// elsewhere), and back once someone is picked, Esc is pressed on an empty
// query, or focus moves elsewhere in the window. The field itself, and its
// results, are the person search's; this keeps only whether it shows, and
// grows the field out of the button's width and shrinks it back into it.
@customElement('sl-find-person')
class FindPersonElement extends LitElement {
  static override styles = css`
    :host {
      display: inline-flex;
    }

    sl-person-search {
      width: min(280px, 40vw);
    }

    /* Mid-morph the field's results would squeeze with it: clip them. */
    sl-person-search[morphing] {
      overflow: hidden;
    }
  `;

  @property({ attribute: false }) persons = new Map<number, PersonRow>();

  @state() private open = false;

  // The running grow or shrink, so one turned back midway starts from where
  // it got to; and the button's width, which the field grows from.
  private morph: Animation | null = null;
  private closing = false;
  // Counts shows and hides, so a show finds out one came after it.
  private turn = 0;
  private buttonWidth = 0;

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

  private search() {
    return this.renderRoot.querySelector('sl-person-search');
  }

  private async show() {
    if (this.open && !this.closing) return;
    const button = this.renderRoot.querySelector('sl-corner-button');
    if (button !== null) this.buttonWidth = button.offsetWidth;
    const from = this.search()?.offsetWidth ?? this.buttonWidth;
    // Turns a shrink back before it can put the button back.
    this.morph?.cancel();
    const turn = ++this.turn;
    this.closing = false;
    this.open = true;
    await this.updateComplete;
    const search = this.search();
    if (search === null) return;
    await search.updateComplete;
    // A hide while it rendered has its own shrink running: leave it be.
    if (turn !== this.turn) return;
    search.focusInput();
    void this.morphTo(search, from, search.offsetWidth);
  }

  private async hide(refocus: boolean) {
    if (!this.open || this.closing) return;
    const search = this.search();
    if (search !== null) {
      this.closing = true;
      this.turn++;
      const done = await this.morphTo(
        search,
        search.offsetWidth,
        this.buttonWidth
      );
      // A ⌘F midway turned it back open.
      if (!done) return;
      this.closing = false;
    }
    this.open = false;
    if (!refocus) return;
    await this.updateComplete;
    this.renderRoot.querySelector('sl-corner-button')?.focus();
  }

  // Slides the field's width between two widths, resolving true once there
  // and false if another morph took over. Its own CSS width holds after.
  private async morphTo(search: HTMLElement, from: number, to: number) {
    // Callers read `from` before this, as cancelling snaps a morph back.
    this.morph?.cancel();
    this.morph = null;
    const slides = !reducedMotion() && from > 0 && from !== to;
    search.toggleAttribute('morphing', slides);
    if (!slides) return true;
    const morph = search.animate(
      [{ width: `${from}px` }, { width: `${to}px` }],
      { duration: MORPH_MS, easing: EASING, fill: 'forwards' }
    );
    this.morph = morph;
    const done = await morph.finished.then(() => true).catch(() => false);
    if (!done) return false;
    this.morph = null;
    search.toggleAttribute('morphing', false);
    // Held at the end only to cover the swap back to the button.
    if (this.closing) return true;
    morph.cancel();
    return true;
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
