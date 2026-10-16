import { css } from 'lit';

// Focus rings show once focus is moved from the keyboard, with Tab, and go
// again when the pointer is used: keys that act on what's shown, such as
// the Scan viewer's arrows, never draw one. Each component with controls
// takes `focusRingStyles`; the document's own come from styles.css.
export const focusRingStyles = css`
  :focus-visible {
    outline: var(--focus-ring);
    outline-offset: 2px;
  }
`;

export function trackFocusRings() {
  const root = document.documentElement;
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Tab') root.toggleAttribute('data-focus-rings', true);
    },
    true
  );
  window.addEventListener(
    'pointerdown',
    () => {
      root.toggleAttribute('data-focus-rings', false);
    },
    true
  );
}
