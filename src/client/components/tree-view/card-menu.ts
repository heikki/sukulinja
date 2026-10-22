import { html, nothing } from 'lit';

import type { PersonRow } from '@/common/types';

import '../context-menu';

import type { Point } from './emit';
import { formatName } from './renderer';

// A card's menu, opened by a right-click: where in the canvas, and for
// whom, drawn at `pos` in the chart.
export interface CardMenu {
  at: Point;
  personId: number;
  pos: Point;
}

// The menu a right-click on `box`'s card opens, in the canvas it's in, in
// place of WebKit's own. Root's own card offers nothing, so opens none.
export function cardMenuAt(
  e: MouseEvent,
  box: { personId: number; pos: Point },
  rootId: number | null
) {
  e.preventDefault();
  const canvas = (e.currentTarget as Element).closest('.canvas');
  if (canvas === null || box.personId === rootId) return null;
  const rect = canvas.getBoundingClientRect();
  const at = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  return { at, personId: box.personId, pos: box.pos };
}

// What a card's menu offers, under its person's name: making them Root.
export function renderCardMenu(
  menu: CardMenu | null,
  persons: Map<number, PersonRow>,
  on: { makeRoot: (menu: CardMenu) => void; close: () => void }
) {
  const person = menu === null ? undefined : persons.get(menu.personId);
  if (menu === null || person === undefined) return nothing;
  const items = [
    {
      label: 'Make Root',
      run: () => {
        on.makeRoot(menu);
      }
    }
  ];
  return html`<sl-context-menu
    .items=${items}
    .heading=${formatName(person)}
    .at=${menu.at}
    @close=${on.close}
  ></sl-context-menu>`;
}
