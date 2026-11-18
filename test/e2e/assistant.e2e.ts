// The assistant, with Claude's answers scripted: what it proposes is
// listed, and written to the tree only when applied (ADR-0028).

import { afterAll, test } from 'bun:test';

import { answer, call } from '@/server/assistant/testing';

import { closeBrowser, shot, withApp } from './app';
import { newTree, openList, turnAssistantOn } from './steps';

afterAll(closeBrowser);

const BIRTH = {
  personId: 1,
  tag: 'BIRT',
  familyId: null,
  date: '1795',
  place: '',
  address: '',
  value: '',
  type: '',
  citationIds: []
};

test('a fact the assistant proposes is added once applied', async () => {
  await withApp(
    async ({ page }) => {
      await newTree(page);
      await turnAssistantOn(page);

      await openList(page, 'Assistant');
      await page.getByLabel('Ask the assistant').fill('Matti syntyi 1795.');
      await page.getByRole('button', { name: 'Ask', exact: true }).click();
      await page.getByText('Ehdotin syntymää.').waitFor();
      await page
        .getByRole('list', { name: 'Proposed changes' })
        .getByText('Add to Matti Esimerkki: Birth 1795')
        .waitFor();
      await shot(page, 'assistant-proposed');
      await page.getByRole('button', { name: 'Apply 1 change' }).click();
      await page.keyboard.press('Escape');

      // His box in the tree now gives the year.
      await page.locator('[data-box-key]').getByText('1795').waitFor();
      await shot(page, 'assistant-applied');
    },
    {
      assistant: [
        answer([call('t1', 'add_fact', BIRTH)], 'tool_use'),
        answer([{ type: 'text', text: 'Ehdotin syntymää.' }], 'end_turn')
      ]
    }
  );
});
