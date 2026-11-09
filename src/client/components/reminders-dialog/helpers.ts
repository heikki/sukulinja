import type { Reminder } from '@/common/types';

// The Reminders the list shows: the open ones, newest first as they come,
// then with `showDone` the done ones.
export function listed(all: Reminder[], showDone: boolean) {
  const open = all.filter((r) => r.done === null);
  return showDone ? [...open, ...all.filter((r) => r.done !== null)] : open;
}

// How many are open; null until they've come.
export function openCount(all: Reminder[] | null | 'failed') {
  return Array.isArray(all) ? all.filter((r) => r.done === null).length : null;
}
