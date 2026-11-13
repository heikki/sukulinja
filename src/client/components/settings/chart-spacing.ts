import { SignalWatcher } from '@lit-labs/signals';
import { css, html, LitElement } from 'lit';
import { customElement } from 'lit/decorators.js';

import {
  chartSpacing,
  resetChartSpacing,
  setChartSpacing,
  SPACING_DEFAULTS
} from '@/client/chart-spacing';
import type { ChartSpacing } from '@/client/chart-spacing';
import { focusRingStyles } from '@/client/focus-ring';

const ROWS: ReadonlyArray<{
  key: keyof ChartSpacing;
  label: string;
  max: number;
}> = [
  { key: 'gapX', label: 'Card gap', max: 80 },
  { key: 'coupleGap', label: 'Couple gap', max: 80 },
  { key: 'gapY', label: 'Row gap', max: 160 },
  { key: 'tieLift', label: 'Tie above bottom', max: 140 },
  { key: 'tieOffset', label: 'Other spouse tie', max: 30 }
];

function pick(key: keyof ChartSpacing, value: number) {
  setChartSpacing({ ...chartSpacing.get(), [key]: value });
}

// Settings' Chart spacing row: a slider for each of the chart's gaps and line
// offsets, the chart following as it moves. A tool for finding the right
// values (see chart-spacing.ts), not a setting to keep.
@customElement('sl-chart-spacing')
class ChartSpacingElement extends SignalWatcher(LitElement) {
  static override styles = [
    focusRingStyles,
    css`
      :host {
        display: grid;
        grid-template-columns: auto 8rem 3.5rem;
        align-items: center;
        gap: 0.35rem 0.6rem;
        font-size: 0.8rem;
        color: var(--muted);
      }
      input {
        width: 100%;
        margin: 0;
        accent-color: var(--accent);
      }
      .value {
        text-align: right;
        font-variant-numeric: tabular-nums;
        color: var(--fg);
      }
      .changed {
        color: var(--accent);
      }
      button {
        grid-column: 1 / -1;
        justify-self: end;
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

  // eslint-disable-next-line @typescript-eslint/class-methods-use-this -- Lit's render hook
  override render() {
    const spacing = chartSpacing.get();
    const changed = ROWS.some(
      ({ key }) => spacing[key] !== SPACING_DEFAULTS[key]
    );
    return html`
      ${ROWS.map(
        ({ key, label, max }) => html`
          <label for=${key}>${label}</label>
          <input
            id=${key}
            type="range"
            min="0"
            max=${max}
            .value=${String(spacing[key])}
            @input=${(e: Event) => {
              pick(key, Number((e.target as HTMLInputElement).value));
            }}
          />
          <span
            class="value ${spacing[key] === SPACING_DEFAULTS[key] ? '' : 'changed'}"
            >${spacing[key]} px</span
          >
        `
      )}
      <button
        ?disabled=${!changed}
        @click=${() => {
          resetChartSpacing();
        }}
      >
        Reset to defaults
      </button>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-chart-spacing': ChartSpacingElement;
  }
}
