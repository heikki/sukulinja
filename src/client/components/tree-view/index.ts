import { html, LitElement, nothing, svg } from 'lit';
import type { PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';

import type { PersonBox, RenderGroup, RenderOutput } from './block';
import {
  AVATAR_CX,
  AVATAR_R,
  BOX_H,
  BOX_W,
  DEFAULT_FOCUS_ID,
  DRAG_THRESHOLD_PX,
  SVG_HALF,
  translatePoint
} from './helpers';
import type { FamilyRow, PersonRow, Point } from './helpers';
import { buildChart } from './layout';
import { treeViewStyles } from './styles';

interface DragOrigin {
  mouse: Point;
  pan: Point;
}

const FOCUS_HASH_RE = /^#\/person\/(?<id>\d+)$/;
const NAME_TRUNCATE = 22;
const SEARCH_MIN_LEN = 2;
const SEARCH_MAX_RESULTS = 50;

function readFocusFromHash() {
  const m = FOCUS_HASH_RE.exec(location.hash);
  const id = m?.groups?.id;
  if (id === undefined) return null;
  return parseInt(id, 10);
}

function formatName(p: PersonRow) {
  const given = (p.given ?? '').trim();
  const surname = (p.surname ?? '').trim();
  const joined = [given, surname].filter((s) => s.length > 0).join(' ');
  return joined.length > 0 ? joined : '—';
}

function formatDates(p: PersonRow) {
  const b = p.birth_year ?? '';
  const d = p.death_year ?? '';
  if (b === '' && d === '') return '';
  return `${b}–${d}`;
}

function truncate(s: string, max: number) {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function photoSrcOf(p: PersonRow) {
  if (p.photo_path === null) return null;
  return `/media/${p.photo_path.replace(/^media\//u, '')}`;
}

function searchKeyOf(p: PersonRow) {
  return `${p.given ?? ''} ${p.surname ?? ''}`.toLowerCase();
}

@customElement('sl-tree-view')
export class TreeViewElement extends LitElement {
  static override styles = treeViewStyles;

  @property({ type: Number, reflect: true }) levels = 1;

  @state() private persons = new Map<number, PersonRow>();
  @state() private focusId: number | null = null;
  @state() private loading = true;
  @state() private query = '';
  @state() private pan = { x: 0, y: 0 };
  @state() private panReady = false;
  @state() private dragging = false;

  private readonly parentFamByPerson = new Map<number, FamilyRow>();
  private readonly spouseFamsByPerson = new Map<number, FamilyRow[]>();

  private dragOrigin: DragOrigin | null = null;
  private dragMoved = false;
  private pendingPinScreen: Point | null = null;

  override connectedCallback() {
    super.connectedCallback();
    window.addEventListener('hashchange', this.onHashChange);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', this.onMouseUp);
    void this.load();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('hashchange', this.onHashChange);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mouseup', this.onMouseUp);
  }

  private readonly onHashChange = () => {
    const id = readFocusFromHash();
    if (id === null || !this.persons.has(id) || id === this.focusId) return;
    // Pan was last set to pin the previously-focused box at click position;
    // without a fresh pin, back/forward would land the new focus at a stale
    // offset. Recenter on the canvas instead.
    this.pendingPinScreen = this.pinFromCanvasCenter();
    this.focusId = id;
  };

  override updated(_changed: PropertyValues) {
    if (this.loading || this.focusId === null) return;
    if (!this.panReady) {
      this.measureInitialPan();
      return;
    }
    if (this.pendingPinScreen !== null) {
      this.applyPin();
    }
  }

  private measureInitialPan() {
    const canvas = this.queryCanvas();
    if (canvas === null || canvas.clientWidth === 0) return;
    this.pan = {
      x: canvas.clientWidth / 2 - SVG_HALF,
      y: canvas.clientHeight / 2 - SVG_HALF
    };
    this.panReady = true;
  }

  // After a focus change, the new focus lives at SVG (0, 0). Set pan so the
  // captured pendingPinScreen pixel coincides with the new focus — eliminating
  // the "jump" effect on refocus.
  private applyPin() {
    this.pan = {
      x: this.pendingPinScreen!.x - SVG_HALF,
      y: this.pendingPinScreen!.y - SVG_HALF
    };
    this.pendingPinScreen = null;
  }

  private queryCanvas() {
    return this.renderRoot.querySelector<HTMLElement>('.canvas');
  }

  private async load() {
    const [personsRes, familiesRes] = await Promise.all([
      fetch('/api/persons'),
      fetch('/api/families')
    ]);
    const persons = (await personsRes.json()) as PersonRow[];
    const families = (await familiesRes.json()) as FamilyRow[];

    this.persons = new Map(persons.map((p) => [p.id, p]));
    this.parentFamByPerson.clear();
    this.spouseFamsByPerson.clear();
    for (const f of families) {
      for (const cid of f.child_ids) this.parentFamByPerson.set(cid, f);
      if (f.husband_id !== null) this.appendSpouseFam(f.husband_id, f);
      if (f.wife_id !== null) this.appendSpouseFam(f.wife_id, f);
    }

    const hashId = readFocusFromHash();
    if (hashId !== null && this.persons.has(hashId)) {
      this.focusId = hashId;
    } else {
      const def = this.pickDefaultFocus();
      this.focusId = def;
      if (def !== null) history.replaceState(null, '', `#/person/${def}`);
    }
    this.loading = false;
  }

  private appendSpouseFam(personId: number, fam: FamilyRow) {
    let arr = this.spouseFamsByPerson.get(personId);
    if (arr === undefined) {
      arr = [];
      this.spouseFamsByPerson.set(personId, arr);
    }
    arr.push(fam);
  }

  private pickDefaultFocus() {
    if (this.persons.has(DEFAULT_FOCUS_ID)) return DEFAULT_FOCUS_ID;
    const first = this.persons.keys().next();
    return first.done === true ? null : first.value;
  }

  resetFocus() {
    if (this.loading) return;
    const def = this.pickDefaultFocus();
    if (def === null) return;
    this.setFocus(def, this.pinFromCanvasCenter());
  }

  private setFocus(id: number, pinScreen: Point | null) {
    if (id === this.focusId) {
      this.query = '';
      return;
    }
    if (pinScreen !== null) this.pendingPinScreen = pinScreen;
    this.focusId = id;
    history.pushState(null, '', `#/person/${id}`);
    this.query = '';
  }

  // Compute pin position directly from layout coords — using getBoundingClientRect
  // on the <g> would include text labels whose width varies by name length,
  // shifting the captured "center" inconsistently and accumulating drift over
  // back-and-forth toggles.
  private pinFromNode(node: Point) {
    return {
      x: this.pan.x + node.x + SVG_HALF,
      y: this.pan.y + node.y + SVG_HALF
    };
  }

  private pinFromCanvasCenter() {
    const canvas = this.queryCanvas();
    if (canvas === null) return null;
    return { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 };
  }

  private readonly onCanvasMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    this.dragOrigin = {
      mouse: { x: e.clientX, y: e.clientY },
      pan: { ...this.pan }
    };
    this.dragMoved = false;
  };

  private readonly onMouseMove = (e: MouseEvent) => {
    if (this.dragOrigin === null) return;
    const dx = e.clientX - this.dragOrigin.mouse.x;
    const dy = e.clientY - this.dragOrigin.mouse.y;
    if (!this.dragMoved && Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) {
      this.dragMoved = true;
      this.dragging = true;
    }
    if (!this.dragMoved) return;
    const nextX = this.dragOrigin.pan.x + dx;
    const nextY = this.dragOrigin.pan.y + dy;
    if (nextX === this.pan.x && nextY === this.pan.y) return;
    this.pan = { x: nextX, y: nextY };
  };

  private readonly onMouseUp = () => {
    this.dragOrigin = null;
    if (!this.dragging) return;
    setTimeout(() => {
      this.dragging = false;
    }, 0);
  };

  private filteredSearch() {
    const q = this.query.trim().toLowerCase();
    if (q.length < SEARCH_MIN_LEN) return [];
    const out: PersonRow[] = [];
    for (const p of this.persons.values()) {
      if (searchKeyOf(p).includes(q)) {
        out.push(p);
        if (out.length >= SEARCH_MAX_RESULTS) break;
      }
    }
    return out;
  }

  private indices() {
    return {
      persons: this.persons,
      parentFamByPerson: this.parentFamByPerson,
      spouseFamsByPerson: this.spouseFamsByPerson,
      levels: this.levels
    };
  }

  private renderBox(box: PersonBox, groupAbs: Point) {
    const p = this.persons.get(box.personId);
    if (p === undefined) return nothing;
    const isFocus = box.personId === this.focusId;
    const x = box.offset.x - BOX_W / 2;
    const y = box.offset.y - BOX_H / 2;
    const chart = translatePoint(groupAbs, box.offset);
    const photoSrc = photoSrcOf(p);
    const name = truncate(formatName(p), NAME_TRUNCATE);
    const dates = formatDates(p);
    return svg`
      <g
        class="node ${isFocus ? 'focus' : ''}"
        data-node-id=${box.personId}
        style="transform: translate(${x}px, ${y}px)"
        @click=${() => {
          if (this.dragMoved) return;
          this.setFocus(box.personId, this.pinFromNode(chart));
        }}
      >
        <rect class="box" x="0" y="0" width=${BOX_W} height=${BOX_H} rx="6" />
        ${
          photoSrc === null
            ? svg`<circle
                class="placeholder-avatar"
                cx=${AVATAR_CX}
                cy=${BOX_H / 2}
                r=${AVATAR_R}
              />`
            : svg`<image
                href=${photoSrc}
                x=${AVATAR_CX - AVATAR_R}
                y=${BOX_H / 2 - AVATAR_R}
                width=${AVATAR_R * 2}
                height=${AVATAR_R * 2}
                clip-path="url(#sl-avatar)"
                preserveAspectRatio="xMidYMid slice"
              />`
        }
        <text class="name" x="60" y=${BOX_H / 2 - 4}>${name}</text>
        <text class="dates" x="60" y=${BOX_H / 2 + 14}>${dates}</text>
        <rect class="hit" x="0" y="0" width=${BOX_W} height=${BOX_H} rx="6" />
      </g>
    `;
  }

  private renderGroup(
    group: RenderGroup,
    key: string,
    parentAbs: Point
  ): unknown {
    const abs = translatePoint(parentAbs, group.offset);
    const isRoot =
      group.offset.x === 0 && group.offset.y === 0 && group.boxes.length === 0;
    const children = svg`
      ${repeat(
        group.boxes,
        (b) => b.personId,
        (b) => this.renderBox(b, abs)
      )}
      ${repeat(
        group.childGroups,
        (_g, i) => `${key}/${i}`,
        (g, i) => this.renderGroup(g, `${key}/${i}`, abs)
      )}
    `;
    if (isRoot) return children;
    return svg`
      <g style="transform: translate(${group.offset.x}px, ${group.offset.y}px)">
        ${children}
      </g>
    `;
  }

  private renderToolbar(
    focusPerson: PersonRow | undefined,
    results: PersonRow[]
  ) {
    return html`
      <div class="toolbar">
        <input
          type="search"
          placeholder="Find person…"
          .value=${this.query}
          @input=${(e: InputEvent) => {
            this.query = (e.target as HTMLInputElement).value;
          }}
        />
        <label class="levels">
          Levels
          <input
            type="range"
            min="1"
            max="5"
            step="1"
            .value=${String(this.levels)}
            @input=${(e: InputEvent) => {
              this.levels = parseInt((e.target as HTMLInputElement).value, 10);
            }}
          />
          <span class="meta">${this.levels}</span>
        </label>
        ${focusPerson === undefined
          ? nothing
          : html`<span class="meta">Focus: ${formatName(focusPerson)}</span>`}
        ${results.length > 0
          ? html`<div class="results">
              ${results.map(
                (p) => html`
                  <button
                    @click=${() => {
                      this.setFocus(p.id, this.pinFromCanvasCenter());
                    }}
                  >
                    ${formatName(p)}
                    ${formatDates(p).length > 0
                      ? html`<span class="meta">(${formatDates(p)})</span>`
                      : nothing}
                  </button>
                `
              )}
            </div>`
          : nothing}
      </div>
    `;
  }

  private renderCanvas(chart: RenderOutput) {
    return html`
      <div
        class="canvas ${this.dragging ? 'dragging' : ''}"
        @mousedown=${this.onCanvasMouseDown}
      >
        ${this.panReady
          ? html`<div
              class="pan"
              style="transform: translate(${this.pan.x}px, ${this.pan.y}px)"
            >
              <svg
                viewBox="${-SVG_HALF} ${-SVG_HALF} ${SVG_HALF * 2} ${SVG_HALF *
                2}"
                width=${SVG_HALF * 2}
                height=${SVG_HALF * 2}
              >
                <defs>
                  <clipPath id="sl-avatar" clipPathUnits="userSpaceOnUse">
                    <circle cx=${AVATAR_CX} cy=${BOX_H / 2} r=${AVATAR_R} />
                  </clipPath>
                </defs>
                <g class="edges">
                  ${repeat(
                    chart.lines,
                    (l) => l.key,
                    (l) => svg`<path
                      class="edge"
                      d="M ${l.from.x} ${l.from.y} L ${l.to.x} ${l.to.y}"
                    />`
                  )}
                </g>
                ${this.renderGroup(chart.rootGroup, 'root', { x: 0, y: 0 })}
              </svg>
            </div>`
          : nothing}
      </div>
    `;
  }

  override render() {
    if (this.loading) return html`<div class="empty">Loading…</div>`;
    if (this.focusId === null) {
      return html`<div class="empty">No people in database.</div>`;
    }
    const chart = buildChart(this.focusId, this.indices());
    if (chart === null) {
      return html`<div class="empty">No data for selected focus.</div>`;
    }
    const results = this.filteredSearch();
    const focusPerson = this.persons.get(this.focusId);
    return html`${this.renderToolbar(focusPerson, results)}${this.renderCanvas(
      chart
    )}`;
  }
}
