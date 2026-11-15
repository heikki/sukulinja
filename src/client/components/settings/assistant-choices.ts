import { SignalWatcher } from '@lit-labs/signals';
import { css, html, LitElement } from 'lit';
import { customElement } from 'lit/decorators.js';

import {
  answerStyle,
  assistantModel,
  includeLiving,
  setAnswerStyle,
  setAssistantModel,
  setIncludeLiving,
  setVisionModel,
  visionModel
} from '@/client/assistant-choices';
import { ANSWER_STYLES, CLAUDE_MODELS } from '@/common/assistant-choices';
import { priceWords } from '@/common/claude-prices';

import { OFF_ON, rowStyles, segmented } from './segmented';

const MODELS = CLAUDE_MODELS.map((m) => ({ value: m.id, label: m.label }));
const STYLES = ANSWER_STYLES.map((s) => ({ value: s.id, label: s.label }));

// Whether people who may be living are sent to Claude, said under the
// choice.
function livingWords(on: boolean) {
  return on ? 'Sent to Anthropic too' : 'Left out, unless selected';
}

// Settings' rows for the Assistant once it's on: which Claude answers,
// with what it costs, how much it says, and whether people who may be
// living go to it, and which Claude reads the scans for Vision Match
// (assistant-choices.ts). Its rows join the Settings grid as its own.
@customElement('sl-assistant-choices')
class AssistantChoicesElement extends SignalWatcher(LitElement) {
  static override styles = [
    rowStyles,
    css`
      :host {
        display: contents;
      }
    `
  ];

  // eslint-disable-next-line @typescript-eslint/class-methods-use-this -- Lit's render hook
  override render() {
    const model = assistantModel.get();
    return html`
      <span class="label">Model</span>
      ${segmented(MODELS, model, setAssistantModel)}
      <span></span>
      <span class="hint">${priceWords(model)}</span>
      <span class="label">Style</span>
      ${segmented(STYLES, answerStyle.get(), setAnswerStyle)}
      <span class="label">Living people</span>
      ${segmented(OFF_ON, includeLiving.get(), setIncludeLiving)}
      <span></span>
      <span class="hint">${livingWords(includeLiving.get())}</span>
      <span class="label">Vision Match</span>
      ${segmented(MODELS, visionModel.get(), setVisionModel)}
      <span></span>
      <span class="hint">${priceWords(visionModel.get())}</span>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-assistant-choices': AssistantChoicesElement;
  }
}
