import { SignalWatcher } from '@lit-labs/signals';
import { css, html, LitElement } from 'lit';
import { customElement } from 'lit/decorators.js';

import {
  answerStyle,
  assistantModel,
  setAnswerStyle,
  setAssistantModel
} from '@/client/assistant-choices';
import { ANSWER_STYLES, ASSISTANT_MODELS } from '@/common/assistant-choices';
import { priceWords } from '@/common/claude-prices';

import { rowStyles, segmented } from './segmented';

const MODELS = ASSISTANT_MODELS.map((m) => ({ value: m.id, label: m.label }));
const STYLES = ANSWER_STYLES.map((s) => ({ value: s.id, label: s.label }));

// Settings' rows for the Assistant once it's on: which Claude answers,
// with what it costs, and how much it says (assistant-choices.ts). Its
// rows join the Settings grid as its own.
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
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-assistant-choices': AssistantChoicesElement;
  }
}
