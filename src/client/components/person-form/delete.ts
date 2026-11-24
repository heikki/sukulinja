import { consume } from '@lit/context';
import { html, LitElement, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import { Asking } from '@/client/asking';
import { appState } from '@/client/state';
import type { AppState } from '@/client/state';
import type { PersonRow } from '@/common/types';

import '../ask';

import type { Ask } from '../ask';
import { formatName } from '../tree-view/renderer';

// Asks before deleting the person, saying what goes with them, and
// deletes them. Dispatches `closed` once done or cancelled.
@customElement('sl-delete-person')
class DeletePersonElement extends LitElement {
  @consume({ context: appState }) private readonly state!: AppState;

  private readonly asking = new Asking(this);

  @property({ attribute: false }) person: PersonRow | null = null;

  private close() {
    if (this.asking.busy) return;
    this.dispatchEvent(new Event('closed'));
  }

  private async confirm(person: PersonRow) {
    const removed = await this.asking.run(() =>
      this.state.personEdits.remove(person.id)
    );
    if (removed) this.close();
  }

  override render() {
    const { person } = this;
    if (person === null) return nothing;
    const close = () => {
      this.close();
    };
    return html`<sl-ask
      .ask=${
        {
          title: `Delete ${formatName(person)}?`,
          text: 'Their Facts, Citations, Tags and Reminders go with them. The Changes stay, naming them.',
          step: 'Delete',
          tone: 'danger'
        } satisfies Ask
      }
      .busy=${this.asking.busy ? 'Deleting…' : null}
      .refused=${this.asking.refused}
      @cancel=${close}
      @confirm=${() => {
        void this.confirm(person);
      }}
    ></sl-ask>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-delete-person': DeletePersonElement;
  }
}
