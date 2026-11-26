import { html } from 'lit';

import './index';

import type { Ask } from './index';

// Asked before a way out of anything being edited and not saved yet, as
// the app's other steps are, without naming what changed: Cancel (as Esc
// or a press outside it does) keeps on editing, Discard drops the changes
// and goes on.
export function renderLeaveAsk({
  keep,
  discard
}: {
  keep: () => void;
  discard: () => void;
}) {
  const ask: Ask = {
    title: 'Discard unsaved changes?',
    step: 'Discard',
    tone: 'danger'
  };
  return html`<sl-ask
    .ask=${ask}
    @cancel=${keep}
    @confirm=${discard}
  ></sl-ask>`;
}
