// A new dataset copied from the people on the chart: from a box's menu,
// or proposed by the assistant and applied.

import { afterAll, expect, test } from 'bun:test';

import type { Page } from 'playwright';

import { answer, call } from '@/server/assistant/testing';

import { closeBrowser, shot, withApp } from './app';
import {
  addRelative,
  boxOf,
  newTree,
  openList,
  turnAssistantOn
} from './steps';

afterAll(closeBrowser);

// Matti with his father and mother.
async function family(page: Page) {
  await newTree(page);
  await addRelative(page, 'Matti', 'Add father…', ['Juho', 'Esimerkki']);
  await addRelative(page, 'Matti', 'Add mother…', ['Maria', 'Malli']);
}

test('the chart is copied as a new dataset from a box’s menu', async () => {
  await withApp(async ({ page }) => {
    await family(page);
    await boxOf(page, 'Juho').click({ button: 'right' });
    const item = page.getByRole('menuitem', {
      name: 'New dataset from the chart…'
    });
    await shot(page, 'copy-dataset-menu');
    await item.click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Name', { exact: true }).fill('Esimerkin kopio');
    await dialog.getByText('Copies the 3 people on the chart').waitFor();
    await shot(page, 'copy-dataset-form');
    await dialog.getByRole('button', { name: 'Copy', exact: true }).click();
    await page.waitForURL(/\/d\/esimerkin-kopio\//u);
    await boxOf(page, 'Maria').waitFor();
    expect(await page.locator('[data-box-key]').count()).toBe(3);
    await shot(page, 'copy-dataset-copied');
  });
});

test('the assistant proposes a copy of the chart, opened once applied', async () => {
  await withApp(
    async ({ page }) => {
      await family(page);
      await turnAssistantOn(page);
      await openList(page, 'Assistant');
      await page
        .getByLabel('Ask the assistant')
        .fill('Tee näkyvästä osasta oma puu.');
      await page.getByRole('button', { name: 'Ask', exact: true }).click();
      await page.getByText('Ehdotin uutta datasettiä.').waitFor();
      await page
        .getByRole('list', { name: 'Proposed changes' })
        .getByText('New dataset Esimerkit: copy everyone on the chart (3)')
        .waitFor();
      await shot(page, 'copy-dataset-proposed');
      await page.getByRole('button', { name: 'Apply 1 change' }).click();
      const open = page.getByRole('link', { name: 'Open Esimerkit' });
      await open.waitFor();
      await shot(page, 'copy-dataset-applied');
      await open.click();
      await page.waitForURL(/\/d\/esimerkit\//u);
      await boxOf(page, 'Juho').waitFor();
    },
    {
      assistant: [
        answer(
          [
            call('t1', 'copy_to_new_dataset', {
              name: 'Esimerkit',
              everyoneOnChart: true,
              personIds: [],
              reason: 'Pyysit näkyvästä osasta oman puun.'
            })
          ],
          'tool_use'
        ),
        answer(
          [{ type: 'text', text: 'Ehdotin uutta datasettiä.' }],
          'end_turn'
        )
      ]
    }
  );
});
