import { css, html, LitElement, svg } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import {
  currentAppearance,
  nextAppearance,
  setAppearance
} from '@client/appearance';
import type { Appearance } from '@client/appearance';

const LABELS: Record<Appearance, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark'
};

// 16×16 glyphs drawn in currentColor: a half-filled circle for "follow the
// system", a sun, a moon.
const ICONS: Record<Appearance, ReturnType<typeof svg>> = {
  system: svg`
    <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.5" />
    <path d="M 8 2 A 6 6 0 0 0 8 14 Z" fill="currentColor" />
  `,
  light: svg`
    <circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.5" />
    <path
      d="M 8 1 V 2.5 M 8 13.5 V 15 M 1 8 H 2.5 M 13.5 8 H 15 M 3 3 L 4.1 4.1 M 11.9 11.9 L 13 13 M 3 13 L 4.1 11.9 M 11.9 4.1 L 13 3"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
    />
  `,
  dark: svg`
    <path
      d="M 13.5 10 A 6 6 0 1 1 6 2.5 A 4.75 4.75 0 0 0 13.5 10 Z"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linejoin="round"
    />
  `
};

// Cycles the appearance System → Light → Dark. The icon shows the current
// choice; the tooltip names it and the next one.
@customElement('sl-theme-toggle')
export class ThemeToggleElement extends LitElement {
  static override styles = css`
    :host {
      display: inline-flex;
    }
    button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 2rem;
      height: 2rem;
      padding: 0;
      background: var(--card);
      color: var(--muted);
      border: 1px solid var(--border);
      border-radius: 6px;
      cursor: pointer;
    }
    button:hover {
      color: var(--accent);
      border-color: var(--accent);
    }
    svg {
      width: 1rem;
      height: 1rem;
    }
  `;

  @state() private appearance: Appearance = currentAppearance();

  override render() {
    const next = nextAppearance(this.appearance);
    const label = `Appearance: ${LABELS[this.appearance]} — click for ${LABELS[next]}`;
    return html`
      <button
        title=${label}
        aria-label=${label}
        @click=${() => {
          setAppearance(next);
          this.appearance = next;
        }}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          ${ICONS[this.appearance]}
        </svg>
      </button>
    `;
  }
}
