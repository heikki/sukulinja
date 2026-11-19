import type { CornerTab } from '../corner-panel/panel';

export type CornerList =
  'reminders' | 'changes' | 'volumes' | 'photos' | 'assistant';

// The corner panel's tabs, in the order of their buttons. The Assistant's
// shows only when it's turned on (assistant-flag.ts).
export const TABS: Array<CornerTab & { id: CornerList }> = [
  { id: 'volumes', label: 'Volumes' },
  { id: 'photos', label: 'Photos' },
  { id: 'reminders', label: 'Reminders' },
  { id: 'changes', label: 'Changes' },
  { id: 'assistant', label: 'Assistant' }
];

export function tabsShown(assistant: boolean) {
  return assistant ? TABS : TABS.filter((t) => t.id !== 'assistant');
}

// The lists button's name, with how many Reminders are open.
export function listsLabel(open: number, assistant = false) {
  const reminders = open === 1 ? '1 open Reminder' : `${open} open Reminders`;
  const lists = assistant
    ? 'Volumes, Photos, Reminders, Changes and Assistant'
    : 'Volumes, Photos, Reminders and Changes';
  return `${lists} (${reminders})`;
}
