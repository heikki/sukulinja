// Facts in the person panel's Events: added, refused when the date can't
// be read, offered a place already written, edited and deleted.

import { afterAll, test } from 'bun:test';

import type { Page } from 'playwright';

import { closeBrowser, shot, withApp } from './app';
import { newTree, openSection } from './steps';

afterAll(closeBrowser);

// The fact's row opened, if it isn't, and its form.
async function editFact(page: Page, row: string) {
  const panel = page.locator('sl-person-panel');
  const closed = panel.getByRole('button', { name: row, expanded: false });
  if ((await closed.count()) > 0) await closed.click();
  await panel.getByRole('button', { name: 'Edit event' }).click();
}

test('a fact is added, edited and deleted in Events', async () => {
  await withApp(async ({ page }) => {
    await newTree(page);
    await page
      .getByRole('button', { name: /Matti Esimerkki$/ })
      .first()
      .click();
    await openSection(page, 'Events');
    const panel = page.locator('sl-person-panel');

    await panel.getByRole('button', { name: 'Add event' }).click();
    await panel.getByLabel('Date').fill('3.3.1795');
    await panel.getByLabel('Place').fill('Esimerkkilä, Juva');
    await panel.getByRole('button', { name: 'Save' }).click();
    const birth = panel.getByRole('button', {
      name: 'Birth 3.3.1795 · Esimerkkilä, Juva'
    });
    await birth.waitFor();

    // A date the form can't read is refused, and the form stays.
    await panel.getByRole('button', { name: 'Add event' }).click();
    await panel
      .getByRole('dialog')
      .getByLabel('Event')
      .selectOption({ label: 'Death' });
    await panel.getByLabel('Date').fill('31.2.1850x');
    // The place written before is offered, and taken.
    await panel.getByLabel('Place').fill('Esim');
    await panel.getByRole('option', { name: 'Esimerkkilä, Juva' }).click();
    await panel.getByRole('button', { name: 'Save' }).click();
    await panel.getByText(/^Write the date like this/).waitFor();
    await shot(page, 'facts-refused');
    await panel.getByLabel('Date').fill('1850');
    await panel.getByRole('button', { name: 'Save' }).click();
    await panel
      .getByRole('button', { name: 'Death 1850 · Esimerkkilä, Juva' })
      .waitFor();

    await editFact(page, 'Birth 3.3.1795 · Esimerkkilä, Juva');
    await panel.getByLabel('Date').fill('4.3.1795');
    await panel.getByRole('button', { name: 'Save' }).click();
    const edited = panel.getByRole('button', {
      name: 'Birth 4.3.1795 · Esimerkkilä, Juva'
    });
    await edited.waitFor();

    await editFact(page, 'Birth 4.3.1795 · Esimerkkilä, Juva');
    await panel.getByRole('button', { name: 'Delete' }).click();
    await edited.waitFor({ state: 'detached' });
    await shot(page, 'facts-done');
  });
});
