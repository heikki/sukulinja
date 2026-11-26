// Facts in the person panel's Facts: added, refused when the date can't
// be read, offered a place already written, edited and deleted.

import { afterAll, test } from 'bun:test';

import type { Page } from 'playwright';

import { closeBrowser, shot, withApp } from './app';
import { newTree, openSection } from './steps';

afterAll(closeBrowser);

// The fact's menu, and one of its items; with `name`, a shot of it open.
async function factMenu(page: Page, row: string, item: string, name = '') {
  const panel = page.locator('sl-person-panel');
  await panel.getByRole('button', { name: row }).click({ button: 'right' });
  const choice = panel.getByRole('menuitem', { name: item });
  await choice.waitFor();
  if (name !== '') await shot(page, name);
  await choice.click();
}

test('a fact is added, edited and deleted in Facts', async () => {
  await withApp(async ({ page }) => {
    await newTree(page);
    await page
      .getByRole('button', { name: /Matti Esimerkki$/ })
      .first()
      .click();
    await openSection(page, 'Facts');
    const panel = page.locator('sl-person-panel');

    await panel.getByRole('button', { name: 'Add fact' }).click();
    await panel.getByLabel('Date').fill('3.3.1795');
    await panel.getByLabel('Place').fill('Esimerkkilä, Juva');
    await panel.getByRole('button', { name: 'Save' }).click();
    const birth = panel.getByRole('button', {
      name: 'Birth 3.3.1795 · Esimerkkilä, Juva'
    });
    await birth.waitFor();

    // A date the form can't read is refused, and the form stays.
    await panel.getByRole('button', { name: 'Add fact' }).click();
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

    await factMenu(
      page,
      'Birth 3.3.1795 · Esimerkkilä, Juva',
      'Edit',
      'facts-menu'
    );
    await shot(page, 'facts-edit');
    await panel.getByLabel('Date').fill('4.3.1795');
    await panel.getByRole('button', { name: 'Save' }).click();
    const edited = panel.getByRole('button', {
      name: 'Birth 4.3.1795 · Esimerkkilä, Juva'
    });
    await edited.waitFor();

    // The keyboard opens it too, and Esc closes it.
    await edited.focus();
    await page.keyboard.press('Shift+F10');
    await panel.getByRole('menuitem', { name: 'Edit' }).waitFor();
    await page.keyboard.press('Escape');
    await panel.getByRole('menuitem', { name: 'Edit' }).waitFor({
      state: 'detached'
    });

    // Delete is the menu's, asked first; Cancel keeps it.
    await factMenu(page, 'Birth 4.3.1795 · Esimerkkilä, Juva', 'Delete');
    const ask = panel.getByRole('alertdialog');
    await ask.getByText('Delete birth?').waitFor();
    await shot(page, 'facts-delete-asked');
    await ask.getByRole('button', { name: 'Cancel' }).click();
    await edited.waitFor();
    await factMenu(page, 'Birth 4.3.1795 · Esimerkkilä, Juva', 'Delete');
    await panel
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Delete' })
      .click();
    await edited.waitFor({ state: 'detached' });
    await shot(page, 'facts-done');
  });
});
