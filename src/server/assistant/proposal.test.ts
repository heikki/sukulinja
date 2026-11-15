import { expect, test } from 'bun:test';

import { Refusal } from '../operations';
import { LARGE, openProposal } from './proposal';

const REMIND = {
  operation: 'remind' as const,
  body: { text: 'Katso.', on: { personId: 1 } },
  label: 'Remind'
};

test("a request the app's operation wouldn't read isn't proposed", () => {
  const proposal = openProposal();
  expect(
    proposal.propose({ ...REMIND, body: { text: 'Katso.' } }, 'Miksi')
  ).toEqual({ rejected: "The app's remind expects { text, on }." });
});

test('applies in order, telling each refused and going on', async () => {
  const proposal = openProposal();
  for (let i = 0; i < 3; i += 1) proposal.propose(REMIND, `${i}`);
  const ran: number[] = [];
  let n = 0;
  const outcomes = await proposal.apply([3, 1, 2, 7], async () => {
    n += 1;
    ran.push(n);
    if (n === 2) throw new Refusal(400, 'Not now.');
    await Promise.resolve();
  });
  expect(ran).toEqual([1, 2, 3]);
  expect(outcomes).toEqual([
    { id: 1, refused: null },
    { id: 2, refused: 'Not now.' },
    { id: 3, refused: null },
    { id: 7, refused: 'Not in the Proposal.' }
  ]);
  expect(proposal.news()).toBe(
    'The user applied items of the Proposal: #1 applied; #2 refused by the app: Not now.; #3 applied.'
  );
  expect(proposal.news()).toBeNull();
  // One applied isn't applied again, nor taken back.
  expect(proposal.withdraw(1)).toBe(false);
  const again = await proposal.apply([1], async () => {
    await Promise.resolve();
  });
  expect(again).toEqual([{ id: 1, refused: 'Not in the Proposal.' }]);
});

test(`more than ${LARGE} items waiting are large`, () => {
  const proposal = openProposal();
  for (let i = 0; i <= LARGE; i += 1) proposal.propose(REMIND, '');
  const all = Array.from({ length: LARGE + 1 }, (_, i) => i + 1);
  expect(proposal.isLarge(all)).toBe(true);
  proposal.withdraw(1);
  expect(proposal.isLarge(all)).toBe(false);
});

test('proposes a batch as one item, applying what it can of it', async () => {
  const proposal = openProposal();
  const asks = [1, 2, 3, 4].map((n) => ({ ...REMIND, label: `Remind ${n}` }));
  const item = proposal.proposeAll(asks, '4 Reminders', 'Miksi');
  expect(item).toEqual({
    id: 1,
    label: '4 Reminders',
    reason: 'Miksi',
    examples: ['Remind 1', 'Remind 2', 'Remind 3']
  });
  let n = 0;
  const outcomes = await proposal.apply([1], async () => {
    n += 1;
    if (n === 3) throw new Refusal(400, 'Not now.');
    await Promise.resolve();
  });
  expect(outcomes).toEqual([
    { id: 1, refused: '1 of 4 not applied: Not now.' }
  ]);
  // Some of it went, so it isn't applied again.
  expect(proposal.withdraw(1)).toBe(false);
});

test('runs a step after its change, on what the change answered', async () => {
  const proposal = openProposal();
  const then = [
    {
      operation: 'support' as const,
      bodyAfter: (factId: unknown) => ({ citationId: 5, factId, on: true })
    }
  ];
  proposal.propose({ ...REMIND, then }, '');
  const ran: unknown[] = [];
  await proposal.apply([1], async (operation, input) => {
    ran.push([operation, input]);
    return await Promise.resolve(41);
  });
  expect(ran).toEqual([
    ['remind', REMIND.body],
    ['support', { citationId: 5, factId: 41, on: true }]
  ]);
});
