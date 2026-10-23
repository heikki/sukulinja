import { html, LitElement, nothing, svg } from 'lit';
import type { PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { ApiError } from '@/client/dataset-api';
import { Floating, typing } from '@/client/floating';
import type { Point } from '@/client/pan-zoom';
import type { ReminderTarget } from '@/common/types';

import type { MenuItem } from '../context-menu';
import { reminderDialogStyles } from './styles';

import '../context-menu';

export { imageLabel, personLabel, placeOf } from './helpers';

// Something a new Reminder can be on, as its header shows it.
export interface ReminderPlace {
  header: string[];
  target: ReminderTarget;
}

// What a new Reminder is on: the Image, or with `cited`, the person's
// Citation while the person's line is ticked.
export interface ReminderPlaces {
  cited: ReminderPlace | null;
  image: ReminderPlace;
}

// What clicking a header line does: shows what it names, or with `open`,
// as it's shown already, closes it.
export interface HeaderGo {
  toggle: () => void;
  open: boolean;
}

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

// A line's whole text as its tooltip, only while it's cut short.
function tooltip(e: Event) {
  const line = e.currentTarget as HTMLElement;
  const cut = line.scrollWidth > line.clientWidth;
  line.title = cut ? line.textContent.trim() : '';
}

// Each on one line, cut short with its whole in the tooltip; one with
// somewhere to go is a button toggling it.
function lines(header: string[], goes: Array<HeaderGo | null> = []) {
  return header.map((line, i) => {
    const go = goes[i] ?? null;
    if (go === null) return html`<div @mouseenter=${tooltip}>${line}</div>`;
    return html`<div>
      <button
        class="go"
        aria-pressed=${go.open ? 'true' : 'false'}
        @mouseenter=${tooltip}
        @click=${go.toggle}
      >
        ${line}
      </button>
    </div>`;
  });
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

// Writing a Reminder, or showing one, headed in muted lines by what it's
// on: for a new one, by `places`, the person's line ticked to put it on
// their Citation or not to put it on the Image; for one shown, by
// `header`, each line toggling what `goes` says. Its text below. With
// `viewing` it opens read-only, with a menu
// of Edit, `actions` and Close in its corner; Edit turns the text into a
// field to change, and Save or Cancel turns it back. Writing one, Save
// runs `save` and closes. Each of `actions` runs and closes; one
// refused says why and stays open. Cancel or Close asks to `close`. A
// panel floating over everything wherever it's opened from, dragged by its
// background, leaving what's under it to be worked on. Presses on it stay
// here, and keys typed in it; ⌘Enter saves.
@customElement('sl-reminder-dialog')
export class ReminderDialogElement extends LitElement {
  static override styles = reminderDialogStyles;

  @property() heading = 'Add reminder';
  @property({ attribute: false }) places: ReminderPlaces | null = null;
  @property({ attribute: false }) header: string[] = [];
  // What clicking each line of `header` toggles; null for nothing.
  @property({ attribute: false }) goes: Array<HeaderGo | null> = [];
  @property({ attribute: false }) text = '';
  // Given the target `places` leaves it on, writing a new one.
  @property({ attribute: false }) save:
    ((text: string, target: ReminderTarget | null) => Promise<void>) | null =
    null;
  @property({ attribute: false }) actions: ReminderDialogAction[] = [];
  @property({ attribute: false }) viewing = false;
  // Where in the window it opens, as where it was asked for; null for
  // where the last one was dragged to.
  @property({ attribute: false }) at: Point | null = null;

  // Its text being changed, from read-only.
  @state() private editing = false;
  @state() private typed: string | null = null;
  // A new one is on the person's Citation, not the Image.
  @state() private withPerson = true;
  @state() private saving = false;
  @state() private error: string | null = null;
  // The menu open, at its top-right corner in the panel.
  @state() private menuAt: Point | null = null;

  private readonly floating = new Floating(this, 'reminder', () => this.at);

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

  // ⌘Enter saves, and keys typed in its fields are theirs; others go on,
  // so the Scan viewer's still work under it.
  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && e.metaKey && !this.readOnly) {
      e.preventDefault();
      e.stopPropagation();
      void this.submit();
    } else if (typing(e)) {
      e.stopPropagation();
    }
  };

  private get target() {
    const { places } = this;
    if (places === null) return null;
    const { cited, image } = places;
    return this.withPerson && cited !== null ? cited.target : image.target;
  }

  private async submit() {
    const { save, target } = this;
    if (save === null) return;
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
      })),
      { label: 'Close', run: this.close }
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

  // Read-only: the menu's button, in its top-right corner.
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
    return html`<div class="top">
      <div class="header">${this.renderPlace()}</div>
      ${this.renderTools()}
    </div>`;
  }

  // What it's on: for a new one on a Citation, the person's line ticked,
  // and unticked, the Image instead.
  private renderPlace() {
    const { places } = this;
    if (places === null) return lines(this.header, this.goes);
    const { cited, image } = places;
    if (cited === null) return lines(image.header);
    const [who, ...where] = cited.header;
    return html`<label class="who">
        <input
          type="checkbox"
          .checked=${this.withPerson}
          @change=${(e: Event) => {
            this.withPerson = (e.target as HTMLInputElement).checked;
          }}
        />${who}
      </label>
      ${lines(this.withPerson ? where : image.header)}`;
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
  'heading' | 'places' | 'text' | 'save' | 'at'
>;

declare global {
  interface HTMLElementTagNameMap {
    'sl-reminder-dialog': ReminderDialogElement;
  }
}
