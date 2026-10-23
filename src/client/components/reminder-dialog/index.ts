import { html, LitElement, nothing, svg } from 'lit';
import type { PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { ApiError } from '@/client/dataset-api';
import { Floating } from '@/client/floating';
import type { Point } from '@/client/pan-zoom';
import type { ReminderTarget } from '@/common/types';

import type { MenuItem } from '../context-menu';
import type { ReminderChoice } from './helpers';
import { reminderDialogStyles } from './styles';

import '../context-menu';

export type { ReminderChoice } from './helpers';
export { imageLabel, personLabel, placeOf, targetOf } from './helpers';

// Something else the dialog can do to the Reminder it shows, beside
// changing its text: marking it done or deleting it. The dialog closes
// once it's done.
export interface ReminderDialogAction {
  label: string;
  run: () => Promise<void> | void;
}

function stop(e: Event) {
  e.stopPropagation();
}

// Three lines, for the menu of what can be done to the Reminder.
const MENU_ICON = html`<svg viewBox="0 0 16 16" aria-hidden="true">
  ${svg`
    <path
      d="M 3 4.5 H 13 M 3 8 H 13 M 3 11.5 H 13"
      fill="none"
      stroke="currentColor"
      stroke-width="1.3"
      stroke-linecap="round"
    />
  `}
</svg>`;

// Writing a Reminder, or showing one: what it's on, picked from `choices`
// starting at `chosen` (or named, when there's only one), and its text.
// With `viewing` it opens read-only, with a menu of Edit and `actions`
// and a close button in its corner; Edit turns the text into a field to
// change, and Save or Cancel turns it back. Writing one, Save runs `save`
// and closes. Each of `actions` runs and closes; one refused says why and
// stays open. Cancel, ✕ or Esc asks to `close`. A panel floating over
// everything wherever it's opened from, dragged by its background, leaving
// what's under it to be worked on. Keys and presses on it stay here, so
// nothing under it acts on them; ⌘Enter saves.
@customElement('sl-reminder-dialog')
export class ReminderDialogElement extends LitElement {
  static override styles = reminderDialogStyles;

  @property() heading = 'Add reminder';
  @property({ attribute: false }) choices: ReminderChoice[] = [];
  @property({ attribute: false }) chosen = 0;
  @property({ attribute: false }) text = '';
  @property({ attribute: false }) save:
    ((text: string, target: ReminderTarget) => Promise<void>) | null = null;
  @property({ attribute: false }) actions: ReminderDialogAction[] = [];
  @property({ attribute: false }) viewing = false;
  // What it's on, as muted lines in place of the heading and On; null to
  // head it with `heading`.
  @property({ attribute: false }) header: string[] | null = null;

  // Its text being changed, from read-only.
  @state() private editing = false;
  @state() private typed: string | null = null;
  @state() private picked: number | null = null;
  @state() private saving = false;
  @state() private error: string | null = null;
  // The menu open, at its top-right corner in the panel.
  @state() private menuAt: Point | null = null;

  private readonly floating = new Floating(this, 'reminder');

  override connectedCallback() {
    super.connectedCallback();
    for (const type of ['pointerdown', 'wheel', 'dblclick', 'contextmenu']) {
      this.addEventListener(type, stop);
    }
    this.addEventListener('mousedown', this.onMouseDown);
    this.addEventListener('keydown', this.onKeyDown);
  }

  // A press anywhere here but on the menu, which keeps its own, closes it,
  // as one outside it would.
  private readonly onMouseDown = (e: MouseEvent) => {
    e.stopPropagation();
    this.menuAt = null;
  };

  override firstUpdated() {
    this.focusFirst();
  }

  // Turning to Edit and back moves focus to the field, and to Edit.
  override updated(changed: PropertyValues) {
    if (changed.get('editing') !== undefined) this.focusFirst();
  }

  // The text field, or read-only, the menu's button.
  private focusFirst() {
    const first = this.renderRoot.querySelector<HTMLElement>(
      'textarea, button.menu'
    );
    first?.focus();
  }

  private get readOnly() {
    return this.viewing && !this.editing;
  }

  private get value() {
    return this.typed ?? this.text;
  }

  private readonly close = () => {
    this.dispatchEvent(new CustomEvent('close'));
  };

  private readonly onKeyDown = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
    } else if (e.key === 'Enter' && e.metaKey && !this.readOnly) {
      e.preventDefault();
      void this.submit();
    }
  };

  private async submit() {
    const target = this.choices[this.picked ?? this.chosen]?.target;
    const { save } = this;
    if (target === undefined || save === null) return;
    if (this.value.trim() === '') return;
    await this.running(async () => {
      await save(this.value, target);
    }, this.viewing);
  }

  // Back to read-only, as it was.
  private readonly stopEditing = () => {
    this.editing = false;
    this.typed = null;
    this.error = null;
  };

  // Runs `run`, one at a time, closing once it's done, or going back to
  // read-only with `toView`.
  private async running(run: () => Promise<void> | void, toView = false) {
    if (this.saving) return;
    this.saving = true;
    this.error = null;
    try {
      await run();
      if (toView) this.stopEditing();
      else this.close();
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      this.error = err.message;
    } finally {
      this.saving = false;
    }
  }

  private items() {
    const items: MenuItem[] = [
      {
        label: 'Edit',
        run: () => {
          this.editing = true;
        }
      },
      ...this.actions.map((action) => ({
        label: action.label,
        run: () => {
          void this.running(action.run);
        }
      }))
    ];
    return items;
  }

  // Opens the menu under its button's right edge, or closes it.
  private toggleMenu(button: HTMLElement) {
    if (this.menuAt !== null) {
      this.menuAt = null;
      return;
    }
    const panel = this.renderRoot.querySelector('.dialog');
    if (panel === null) return;
    const at = button.getBoundingClientRect();
    const box = panel.getBoundingClientRect();
    this.menuAt = { x: at.right - box.left, y: at.bottom - box.top + 4 };
  }

  // Read-only: the menu's button and closing, in its top-right corner.
  private renderTools() {
    if (!this.readOnly) return nothing;
    return html`<div class="tools">
      <button
        class="icon menu"
        aria-label="More"
        aria-haspopup="menu"
        aria-expanded=${this.menuAt === null ? 'false' : 'true'}
        ?disabled=${this.saving}
        @mousedown=${stop}
        @click=${(e: Event) => {
          this.toggleMenu(e.currentTarget as HTMLElement);
        }}
      >
        ${MENU_ICON}
      </button>
      <button class="icon" aria-label="Close" @click=${this.close}>✕</button>
    </div>`;
  }

  private renderMenu() {
    if (this.menuAt === null) return nothing;
    return html`<sl-context-menu
      .items=${this.items()}
      .at=${this.menuAt}
      .alignRight=${true}
      @close=${() => {
        this.menuAt = null;
      }}
    ></sl-context-menu>`;
  }

  private renderHeader() {
    const { header } = this;
    if (header === null) {
      return html`<h2>${this.heading}</h2>
        ${this.renderOn()}`;
    }
    return html`<div class="top">
      <div class="header">
        ${header.map((line) => html`<div>${line}</div>`)}
      </div>
      ${this.renderTools()}
    </div>`;
  }

  private renderOn() {
    if (this.choices.length === 1) {
      return html`<p class="on">On ${this.choices[0]!.label}</p>`;
    }
    const at = this.picked ?? this.chosen;
    return html`
      <label for="on">On</label>
      <select
        id="on"
        @change=${(e: Event) => {
          this.picked = (e.target as HTMLSelectElement).selectedIndex;
        }}
      >
        ${this.choices.map(
          (c, i) => html`<option ?selected=${i === at}>${c.label}</option>`
        )}
      </select>
    `;
  }

  private renderText() {
    if (this.readOnly) return html`<p class="text">${this.text}</p>`;
    return html`<textarea
      aria-label="Reminder"
      .value=${this.value}
      @input=${(e: Event) => {
        this.typed = (e.target as HTMLTextAreaElement).value;
      }}
    ></textarea>`;
  }

  private renderEditButtons() {
    return html`
      <button
        @click=${this.viewing ? this.stopEditing : this.close}
        ?disabled=${this.saving}
      >
        Cancel
      </button>
      <button
        class="primary"
        ?disabled=${this.saving || this.value.trim() === ''}
        @click=${() => {
          void this.submit();
        }}
      >
        ${this.saving ? 'Saving…' : 'Save'}
      </button>
    `;
  }

  override render() {
    return html`
      <div
        class="dialog"
        popover="manual"
        role="dialog"
        @pointerdown=${this.floating.grip}
        aria-label=${this.heading}
      >
        ${this.renderHeader()} ${this.renderText()}
        ${this.error === null ? nothing : html`<p class="error">${this.error}</p>`}
        ${
          this.readOnly
            ? nothing
            : html`<div class="actions">${this.renderEditButtons()}</div>`
        }
        ${this.renderMenu()}
      </div>
    `;
  }
}

// What the dialog opens with.
export type ReminderDialogProps = Pick<
  ReminderDialogElement,
  'heading' | 'choices' | 'chosen' | 'text' | 'save'
>;

declare global {
  interface HTMLElementTagNameMap {
    'sl-reminder-dialog': ReminderDialogElement;
  }
}
