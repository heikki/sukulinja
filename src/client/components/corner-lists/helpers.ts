import type { CornerTab } from '../corner-panel/panel';

export type CornerList = 'reminders' | 'changes' | 'church-books';

// The corner panel's tabs, in the order of their buttons.
export const TABS: Array<CornerTab & { id: CornerList }> = [
  { id: 'reminders', label: 'Reminders' },
  { id: 'changes', label: 'Changes' },
  { id: 'church-books', label: 'Church books' }
];

// What's open once a corner button is pressed: its list, or nothing when
// its list was the one open.
export function pressed(open: CornerList | null, list: CornerList) {
  return open === list ? null : list;
}

// The Reminders button's name, with how many are open.
export function remindersLabel(open: number) {
  return open === 1 ? 'Reminders, 1 open' : `Reminders, ${open} open`;
}
