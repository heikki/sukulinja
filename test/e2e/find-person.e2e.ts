// Find person in the chart's corner: a button that turns into the search
// field, and back once someone is picked or Esc is pressed.

import { afterAll, expect, test } from 'bun:test';

import { closeBrowser, shot, withApp } from './app';
import { addRelative, newTree } from './steps';

afterAll(closeBrowser);

test('the corner search opens from its button and selects whom it finds', async () => {
  await withApp(async ({ page }) => {
    await newTree(page);
    await addRelative(page, 'Matti', 'Add father…', ['Juho', 'Esimerkki']);
    const button = page.getByRole('button', { name: 'Find person' });
    const field = page.getByRole('combobox');
    expect(await field.count()).toBe(0);
    await shot(page, 'find-person-button');

    await button.click();
    await field.fill('Juho');
    await shot(page, 'find-person-open');
    await page.getByRole('option', { name: 'Juho Esimerkki' }).click();
    await page.waitForURL(/sel=2/);
    await button.waitFor();
    expect(await field.count()).toBe(0);

    // ⌘F opens it with the cursor in it. Esc clears the query, Esc again
    // puts the button back, focused, so Enter opens it again.
    await page.keyboard.press('ControlOrMeta+f');
    await page.keyboard.type('Matti');
    await page.getByRole('option', { name: 'Matti Esimerkki' }).waitFor();
    await page.keyboard.press('Escape');
    expect(await page.getByRole('option').count()).toBe(0);
    await page.keyboard.press('Escape');
    await button.waitFor();
    await page.keyboard.press('Enter');
    await field.waitFor();
  });
});
