// Reminders written on a person and worked through, and the Changes list
// of what was done, which leads back to the person and can be cleared.

import { afterAll, expect, test } from 'bun:test';

import { closeBrowser, shot, withApp } from './app';
import { addRelative, fromBox, newTree, openList } from './steps';

afterAll(closeBrowser);

test('a reminder is written, done and deleted; the Changes cleared', async () => {
  await withApp(async ({ page }) => {
    await newTree(page);
    await addRelative(page, 'Matti', 'Add father…', ['Juho', 'Esimerkki']);

    // On Juho, from his box.
    await fromBox(page, 'Juho', 'Add reminder…');
    await page.getByLabel('New reminder').fill('Find his baptism');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const list = page.locator('sl-reminders-list');
    await list.getByText('Find his baptism').waitFor();
    await list.getByText('Juho Esimerkki').first().waitFor();
    await shot(page, 'reminders-written');

    await list.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByLabel('Reminder', { exact: true }).fill('Find his birth');
    await list.getByRole('button', { name: 'Save', exact: true }).click();
    await list.getByText('Find his birth').waitFor();

    // Done, it's hidden until asked for.
    await list.getByRole('button', { name: 'Done', exact: true }).click();
    await list.getByText('Find his birth').waitFor({ state: 'detached' });
    await list.getByRole('button', { name: 'Show done (1)' }).click();
    await list.getByRole('button', { name: 'Reopen' }).click();
    await list.getByRole('button', { name: 'Delete', exact: true }).click();
    await list.getByText('Find his birth').waitFor({ state: 'detached' });

    // What was done, newest first; a Change leads to its person.
    await page.getByRole('tab', { name: 'Changes' }).click();
    const changes = page.locator('sl-changes-list');
    await changes.getByText('Started the dataset').waitFor();
    await shot(page, 'reminders-changes');
    await changes.getByRole('button', { name: /Added as father/ }).click();
    await page
      .locator('sl-side-dock .rail-heading')
      .filter({ hasText: 'Juho Esimerkki' })
      .waitFor({ state: 'attached' });

    await openList(page, 'Changes');
    await changes.getByRole('button', { name: 'Clear…' }).click();
    await page
      .getByRole('alertdialog', { name: 'Clear the Changes?' })
      .getByRole('button', { name: 'Clear', exact: true })
      .click();
    await changes.getByText('Nothing done here yet.').waitFor();
    expect(await changes.getByRole('button').count()).toBe(0);
  });
});
