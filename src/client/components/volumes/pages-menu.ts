// A Volume's page numbers worked on from the Volumes tab (ADR-0032): the
// menu a right-click on its row opens, marking them checked or as none, or
// unmarked; and, not marked, a page survey (while the Assistant is on) or
// taking those read or set away, each asked first where it takes away
// what can't be got back.

import { html, nothing } from 'lit';

import type { Point } from '@/client/pan-zoom';
import type { PageMark, VolumesRow } from '@/common/types';

import '../context-menu';

import type { MenuAsk, MenuItem } from '../context-menu';

// An open menu, its Volume and where it drops from in the tab; with
// `ask`, the question before a step that takes pages away.
export interface PagesMenu {
  book: VolumesRow;
  at: Point;
  ask?: MenuAsk;
}

export interface PagesActions {
  mark: (book: VolumesRow, as: PageMark | null) => void;
  // The model a survey asks, by its label; null while the Assistant is
  // off.
  model: string | null;
  // Each from where the menu was, to ask there; the menu's closed by the
  // time they run.
  survey: (book: VolumesRow, at: Point) => void;
  clear: (book: VolumesRow, at: Point) => void;
}

export function pagesItems(
  book: VolumesRow,
  at: Point,
  on: PagesActions
): MenuItem[] {
  function mark(as: PageMark | null) {
    return () => {
      on.mark(book, as);
    };
  }
  if (book.pages === 'checked') {
    return [{ label: 'Unmark page numbers checked', run: mark(null) }];
  }
  if (book.pages === 'none') {
    return [{ label: 'Unmark no page numbers', run: mark(null) }];
  }
  const items: MenuItem[] = [];
  if (on.model !== null) {
    items.push({
      label: 'Survey page numbers',
      detail: on.model,
      run: () => {
        on.survey(book, at);
      }
    });
  }
  if (book.pages === 'read') {
    items.push({
      label: 'Clear page numbers',
      run: () => {
        on.clear(book, at);
      }
    });
  }
  items.push(
    { label: 'Mark page numbers checked', run: mark('checked') },
    {
      label: 'Mark as no page numbers',
      detail: 'References place the volume only',
      run: mark('none')
    }
  );
  return items;
}

function images(n: number) {
  return n === 1 ? '1 Image' : `${n} Images`;
}

// The questions before a survey takes away pages set by hand, and before
// clearing takes away every page read or set.
export function surveyAsk(byHand: number) {
  return `The survey takes away ${byHand === 1 ? 'the page' : `${byHand} pages`} set by hand in this Volume.`;
}

export function clearAsk(pinned: number) {
  return `Takes away the page numbers read or set on ${images(pinned)} of this Volume.`;
}

// The menu, or its question: Cancel, or the step.
export function renderPagesMenu(
  menu: PagesMenu | null,
  on: PagesActions,
  close: () => void
) {
  if (menu === null) return nothing;
  const items =
    menu.ask === undefined ? pagesItems(menu.book, menu.at, on) : [];
  return html`<sl-context-menu
    .ask=${menu.ask ?? null}
    .items=${items.map((i) => ({
      ...i,
      run: () => {
        close();
        i.run();
      }
    }))}
    .at=${menu.at}
    @close=${close}
  ></sl-context-menu>`;
}
