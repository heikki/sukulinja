// What's been noted and done in the app: the Reminders and the Changes.

import type { ChangeOn } from '@/common/types';

import type { TreeView } from '../tree-view';
import { readOperation } from './operation';

// Whom something is on, unless they're left out.
function about(view: TreeView, on: ChangeOn | null) {
  if (on === null) return null;
  if (on.kind === 'image') {
    return {
      image: `${on.volume}, image ${on.image}`,
      person: on.personId === null ? null : view.ref(on.personId)
    };
  }
  return { person: view.ref(on.personId) };
}

export const reminders = readOperation<{ includeDone: boolean }>({
  name: 'reminders',
  description:
    "The Reminders written in the app (things to come back to), newest first: each one's text, whom or which church-book image it's on, and whether it's done.",
  input: {
    type: 'object',
    properties: { includeDone: { type: 'boolean' } },
    required: ['includeDone'],
    additionalProperties: false
  },
  label: () => 'Reading Reminders',
  async run(view, { includeDone }) {
    const all = await view.services.reminders.list();
    return all
      .filter((r) => includeDone || r.done === null)
      .map((r) => ({
        text: r.text,
        on: about(view, r.on),
        written: r.created.slice(0, 10),
        done: r.done?.slice(0, 10) ?? null
      }));
  }
});

export const changes = readOperation<{ limit: number }>({
  name: 'changes',
  description:
    'The latest Changes made in the app, newest first: when, what was done (as JSON), and whom it was on. `limit` is how many, at most 200.',
  input: {
    type: 'object',
    properties: { limit: { type: 'integer' } },
    required: ['limit'],
    additionalProperties: false
  },
  label: () => 'Reading the Changes',
  async run(view, { limit }) {
    const all = await view.services.changes.list();
    return all.slice(0, Math.max(1, Math.min(200, limit))).map((c) => {
      const on = about(view, c.on);
      const leftOut =
        on !== null && 'person' in on && typeof on.person === 'string';
      return {
        at: c.at.slice(0, 16),
        what: c.what,
        on,
        who: leftOut ? null : c.who
      };
    });
  }
});
