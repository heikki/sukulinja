import { css } from 'lit';

// The Scan viewer's own, over the viewer's: the thumbnail and the frame.
export const scanViewerStyles = css`
  /* The full Image arriving over its blurred thumbnail. */
  .stage img.fade {
    transition: opacity 0.35s ease-out;
  }

  /* A thumbnail is a 250px image scaled up thirtyfold: blurred, its pixels
     read as a soft preview. */
  .stage img.thumb {
    filter: blur(1.5px);
  }

  .frame {
    position: absolute;
    top: 0;
    left: 0;
    transform-origin: 0 0;
    background: var(--card);
  }
`;

// Over the foot bar's: as wide whatever the Volume, the count keeps room
// for four digits.
export const scanNavStyles = css`
  /* Bare, as the close button is; a tint shows them on hover. */
  button {
    border-color: transparent;
    background: none;
    color: var(--muted);
  }

  /* The Volume shown is on Astia's old filming, read-only. */
  button.old-filming {
    border-color: var(--accent);
    color: var(--accent);
  }

  button:hover:not(:disabled) {
    border-color: transparent;
    background: color-mix(in srgb, var(--fg) 8%, transparent);
    color: var(--fg);
  }

  /* A held arrow key's button: a quiet press, not the hover's accent. */
  button.pressed:not(:disabled) {
    background: color-mix(in srgb, var(--fg) 10%, var(--card));
  }

  /* Four digits, without the spinner: the arrows beside it step. */
  input {
    width: calc(4ch + 0.8rem);
    appearance: textfield;
    font-variant-numeric: tabular-nums;
  }

  input::-webkit-inner-spin-button,
  input::-webkit-outer-spin-button {
    margin: 0;
    appearance: none;
  }

  .count {
    min-width: 7ch;
    font-variant-numeric: tabular-nums;
  }
`;

// The stage with no Volume shown: its note, and the Volume list over it.
export const scanEmptyStyles = css`
  :host {
    position: relative;
    flex: 1;
    min-width: 0;
    overflow: hidden;
  }

  .note {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 1rem;
    color: var(--muted);
    text-align: center;
  }

  .why {
    color: var(--fg);
    font-weight: 600;
  }

  .hint {
    max-width: 24rem;
  }
`;
