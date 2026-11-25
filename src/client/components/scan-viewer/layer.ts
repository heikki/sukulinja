import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { visionModel } from '@/client/assistant-choices';
import { assistantOn } from '@/client/assistant-flag';
import { ApiError } from '@/client/dataset-api';
import type { Point, Transform } from '@/client/pan-zoom';
import { appState, citingImage } from '@/client/state';
import type { AppState, LinkOpen } from '@/client/state';
import { CLAUDE_MODELS } from '@/common/assistant-choices';
import { firstGuess } from '@/common/entry-events';
import type { Box, PersonName } from '@/common/types';

import type { Ask } from '../ask';
import { boxFromStage } from '../box-stage/geometry';
import { searchable } from '../person-search/choices';
import { placesHere } from '../reminders-list/places';
import { alsoCiting } from './also';
import { entriesOn } from './citations';
import { pickFor, rolePickLabel, startingPeople, withChild } from './cite';
import { scanLayerStyles } from './edit-styles';
import { newEntryBox } from './frame';
import type { Frame } from './frame';
import { linkItems } from './menu';
import { renderVolumeChange } from './volume-change';

import '../ask';
import '../box-stage/handles';
import '../context-menu';
import '../person-search/pick';

// What a right-click opened: the menu, or the Volumes chosen from it; or
// the people to name in a new entry's Role (or with none), listed or
// searched.
type Popup =
  | {
      at: Point;
      onBox: boolean;
      show: 'menu' | 'volumes' | 'unchecked';
      // With `unchecked`: the Vision Match asked for.
      locate?: () => void;
    }
  | { at: Point; show: 'pick'; role: string | null };

// How far in from the stage's right edge a pick opened from the Entry's
// pane starts: its search's width (person-search/pick.ts) and a margin.
const PICK_PX = 16 * 16 + 8;

// Editing the current source's Link over the scan: the menu a right-click
// opens (`openMenu`), the Volumes opened from it, a new entry Box put where
// the menu opened, for the source or for a new Citation of someone in the
// Selected person's family or found by search, and the pending
// Box with handles to move and resize it. Presses on
// anything of its own stay here, so they don't pan the scan; elsewhere the
// scan pans as ever. `canEdit` is false until the full Image is shown,
// whose frame Boxes are measured in.
@customElement('sl-scan-layer')
class ScanLayerElement extends SignalWatcher(LitElement) {
  static override styles = scanLayerStyles;

  @consume({ context: appState }) private readonly state!: AppState;

  @property({ attribute: false }) view: Transform | null = null;
  @property({ attribute: false }) frame: Frame | null = null;
  @property({ type: Boolean }) canEdit = false;
  // The dataset's people, who name the citations.
  private get persons() {
    return this.state.chart.people.get().persons;
  }

  @state() private popup: Popup | null = null;
  // Where the source's Box's menu last opened, where taking the Box back
  // or confirming it is asked about; null centres it.
  private boxMenuAt: Point | null = null;
  // Taking the Box back, and the server's words if it refused.
  @state() private discardBusy = false;
  @state() private discardRefused: string | null = null;

  // The menu at `at` on the stage; `onBox` when it's on the source's own
  // entry Box, which then has a menu of its own.
  // None over a Volume on a filming Astia replaced: it's read-only.
  openMenu(at: Point, onBox: boolean) {
    if (this.viewer.oldFilming.get()) return;
    if (onBox) {
      this.boxMenuAt = at;
      this.discardRefused = null;
    }
    this.popup = { at, onBox, show: 'menu' };
  }

  // Whom to name in the pending Entry's Role, picked where the press at
  // `client` in the window was, kept on the stage (entry-form.ts).
  openPick(client: Point, role: string | null) {
    const box = this.getBoundingClientRect();
    const at = {
      x: Math.max(0, Math.min(client.x - box.left, box.width - PICK_PX)),
      y: client.y - box.top
    };
    this.popup = { at, show: 'pick', role };
  }

  // Closes a menu or pick open over the scan, as a press elsewhere does.
  closePopup() {
    this.popup = null;
  }

  // A Volume on a filming Astia replaced is read-only until switched.
  private get editable() {
    return this.canEdit && !this.viewer.oldFilming.get();
  }

  private get viewer() {
    return this.state.viewer;
  }

  private readonly onPopupClose = () => {
    this.popup = null;
  };

  // A new entry Box at `at` on the stage, sized as the Image's other
  // entries; null until the full Image is shown.
  private newBoxAt(at: Point) {
    const { view, frame } = this;
    if (view === null || frame === null) return null;
    const point = boxFromStage(
      { left: at.x, top: at.y, width: 0, height: 0 },
      view
    );
    const rows = this.viewer.citations.get();
    const others = Array.isArray(rows)
      ? entriesOn(rows, this.viewer.image.get()).map((e) => e.box)
      : [];
    return newEntryBox({ x: point.left, y: point.top }, others, frame.size);
  }

  // A new pending Box at `at` for the source's entry, to move and resize
  // from there.
  private placeBox(at: Point) {
    const box = this.newBoxAt(at);
    if (box !== null) this.viewer.setBox(box);
  }

  // A pending Box at `at` for a new Entry, of the Event the Entry before
  // it or the Volume's Book suggests, naming to start with whom that and
  // the Selected person suggest.
  private newEntry(at: Point) {
    this.popup = null;
    const box = this.newBoxAt(at);
    const shown = this.viewer.volume.get();
    if (box === null || shown === null) return;
    const rows = this.viewer.citations.get();
    const event = firstGuess(shown.label, Array.isArray(rows) ? rows : [], {
      image: this.viewer.image.get(),
      box
    });
    const people = startingPeople(
      event,
      this.state.selected.id.get(),
      this.state.chart.people.get(),
      this.citingHere()
    );
    this.viewer.newEntry(box, event, people);
  }

  // Whose Citations already link the Image shown: not cited for again.
  private citingHere() {
    const rows = this.viewer.citations.get();
    return citingImage(
      Array.isArray(rows) ? rows : [],
      this.viewer.image.get()
    );
  }

  // Whom to name in the Role (`label`): in a baptism, once its child or a
  // parent is named, whom the tree says; else the Selected person's family
  // and the search. Never those `notNamable`.
  private renderPick(at: Point, role: string | null) {
    const selected = this.state.selected.id.get();
    const named = this.namedNow();
    const left = this.viewer.entryForm.notNamable.get();
    const event = this.eventNow();
    const ix = this.state.chart.people.get();
    const pick = pickFor({ event, role, named }, ix, selected, left);
    return html`<sl-person-pick
      .heading=${rolePickLabel(event, role)}
      .at=${at}
      .newOne=${pick.newOne}
      .search=${pick.search}
      .choices=${pick.choices}
      .persons=${searchable(this.persons, left)}
      @pick=${(e: CustomEvent<{ id: number }>) => {
        this.popup = null;
        this.named(e.detail.id, role);
      }}
      @pick-new=${(e: CustomEvent<PersonName>) => {
        this.popup = null;
        this.named(this.viewer.entryForm.nameNew(e.detail), role);
      }}
      @close=${this.onPopupClose}
    ></sl-person-pick>`;
  }

  // Someone picked for the Role. A baptism's child brings their parents
  // in the tree, in place of those named before.
  private named(personId: number, role: string | null) {
    const people = this.namedNow();
    if (role === 'CHIL' && this.eventNow() === 'CHR') {
      const ix = this.state.chart.people.get();
      this.viewer.entryForm.setPeople(withChild(people, personId, ix));
    } else this.viewer.entryForm.setInEntry({ personId, role });
  }

  // What the pending Entry records, if chosen.
  private eventNow() {
    const pending = this.viewer.pending.get();
    return pending === null || pending.kind === 'mark'
      ? null
      : pending.cite.event;
  }

  // Who the pending Entry names so far.
  private namedNow() {
    const pending = this.viewer.pending.get();
    return pending === null || pending.kind === 'mark'
      ? []
      : pending.cite.people;
  }

  // A Reminder on the Image shown and the Selected person, written in the
  // Reminders list.
  private remind() {
    const places = placesHere(this.state);
    if (places === null) return;
    this.popup = null;
    this.state.reminders.draft(places);
  }

  // Locating the estimates on the Image with Vision Match, while the
  // Assistant is on: its key and the model are set beside it in Settings
  // (ADR-0029).
  private visionItem() {
    if (!assistantOn.get()) return {};
    const model = visionModel.get();
    const label = CLAUDE_MODELS.find((m) => m.id === model)?.label ?? model;
    const shown = this.popup;
    // On a Volume whose page numbers aren't marked checked, it asks first
    // (Heikki, 2026-11-19): its estimates count from them.
    const asking = (locate: () => void) =>
      this.askUnchecked.bind(this, shown, locate);
    return {
      locate: {
        model: label,
        run: asking(() => {
          void this.viewer.findAllByVision(model);
        }),
        runVolume: asking(() => {
          void this.viewer.findAllInVolumeByVision(model);
        })
      }
    };
  }

  private askUnchecked(shown: Popup | null, locate: () => void) {
    if (this.viewer.pages.locked.get() || shown?.show !== 'menu') {
      this.popup = null;
      locate();
      return;
    }
    this.popup = { ...shown, show: 'unchecked', locate };
  }

  private renderPopup() {
    const { popup } = this;
    if (popup === null) return nothing;
    if (popup.show === 'pick') return this.renderPick(popup.at, popup.role);
    const { at, onBox, show } = popup;
    if (show === 'unchecked' && popup.locate !== undefined) {
      return this.renderUncheckedWarning(at, popup.locate);
    }
    if (show === 'volumes') {
      return renderVolumeChange(this.viewer, this.onPopupClose);
    }
    const items = linkItems(
      this.viewer,
      { onBox, canBox: this.editable },
      {
        chooseVolume: () => {
          this.popup = { at, onBox, show: 'volumes' };
        },
        placeBox: () => {
          this.placeBox(at);
        },
        cite: () => {
          this.newEntry(at);
        },
        remind: () => {
          this.remind();
        },
        ...this.visionItem()
      }
    );
    return html`<sl-context-menu
      .items=${items}
      .at=${at}
      @close=${this.onPopupClose}
    ></sl-context-menu>`;
  }

  // Before Vision Match on a Volume whose page numbers aren't marked
  // checked: locate anyway, or not.
  private renderUncheckedWarning(at: Point, locate: () => void) {
    const ask: Ask = {
      title: 'Locate anyway?',
      text: "This Volume's page numbers aren't marked checked; the estimates count from them.",
      step: 'Locate',
      tone: 'primary'
    };
    return html`<sl-ask
      .ask=${ask}
      .at=${at}
      @cancel=${this.onPopupClose}
      @confirm=${() => {
        this.onPopupClose();
        locate();
      }}
    ></sl-ask>`;
  }

  // The pending Box, to move and resize.
  private renderBox() {
    const { view, frame } = this;
    if (frame === null || !this.editable) return nothing;
    const pending = this.viewer.boxPending.get()
      ? this.viewer.boxHere.get()
      : null;
    return html`<sl-box-handles
      .box=${pending}
      .view=${view}
      .size=${frame.size}
      @box-set=${(e: CustomEvent<Box>) => {
        this.viewer.setBox(e.detail);
      }}
    ></sl-box-handles>`;
  }

  override render() {
    return html`${this.renderBox()} ${this.renderPopup()}
    ${this.renderDiscard()} ${this.renderConfirming()}`;
  }

  // Taking back the source's Box, asked as its menu's item was named,
  // where the menu was: a Match or a Mark discarded, with whom the Mark
  // goes for too, or a Citation made in the app deleted, with its Entry.
  private renderDiscard() {
    const { viewer } = this;
    const source = viewer.source.get();
    if (!viewer.discarding.get() || source === null) return nothing;
    const ask = this.discardAsk(source);
    return html`<sl-ask
      .ask=${ask}
      .at=${this.boxMenuAt}
      .busy=${this.discardBusy ? `${ask.step === 'Delete' ? 'Deleting' : 'Discarding'}…` : null}
      .refused=${this.discardRefused}
      @cancel=${() => {
        this.discardRefused = null;
        viewer.cancel();
      }}
      @confirm=${() => {
        void this.confirmDiscard();
      }}
    ></sl-ask>`;
  }

  private discardAsk(source: LinkOpen): Ask {
    const { entry } = this.viewer;
    if (entry.deletes.get()) {
      const n = entry.people.get().length;
      return n > 1
        ? {
            title: 'Delete entry?',
            text: `The entry and all ${n} citations of it are deleted.`,
            step: 'Delete',
            tone: 'danger'
          }
        : {
            title: 'Delete citation?',
            text: 'The citation is deleted, with its box.',
            step: 'Delete',
            tone: 'danger'
          };
    }
    const match = entry.kind.get() === 'match';
    const names = alsoCiting(this.state, source);
    return {
      title: match ? 'Discard match?' : 'Discard mark?',
      // A Mark shared by everyone citing the record goes for them too.
      text: names.length === 0 ? undefined : `Also for ${names.join(', ')}.`,
      step: 'Discard',
      tone: 'danger'
    };
  }

  private async confirmDiscard() {
    this.discardBusy = true;
    this.discardRefused = null;
    try {
      await this.viewer.confirmDiscard();
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      this.discardRefused = err.message;
    } finally {
      this.discardBusy = false;
    }
  }

  // A Match confirmed from its Box's menu, where the menu was, while it's
  // saved, and why not when it's refused, to try again.
  private renderConfirming() {
    const confirming = this.viewer.confirming.get();
    if (confirming === null) return nothing;
    const refused = confirming === 'saving' ? null : confirming.refused;
    const ask: Ask = {
      title: refused === null ? 'Confirming match' : "Couldn't confirm",
      text: 'It becomes a citation of this Image.',
      step: 'Try again',
      tone: 'primary'
    };
    return html`<sl-ask
      .ask=${ask}
      .at=${this.boxMenuAt}
      .busy=${refused === null ? 'Confirming…' : null}
      .refused=${refused}
      @cancel=${() => {
        this.viewer.cancel();
      }}
      @confirm=${() => {
        void this.viewer.confirmSource();
      }}
    ></sl-ask>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-scan-layer': ScanLayerElement;
  }
}
