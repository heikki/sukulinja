// A family built from the menu on the boxes in the tree: relatives added,
// one moved to other parents, one deleted.

import { afterAll, expect, test } from 'bun:test';

import { closeBrowser, shot, withApp } from './app';
import { addRelative, boxOf, fromBox, newTree, openSection } from './steps';

afterAll(closeBrowser);

test('relatives are added, moved and deleted from their boxes', async () => {
  await withApp(async ({ page }) => {
    await newTree(page);
    await addRelative(page, 'Matti', 'Add father…', ['Juho', 'Esimerkki']);
    await addRelative(page, 'Matti', 'Add mother…', ['Maria', 'Malli']);
    await addRelative(page, 'Matti', 'Add spouse…', ['Liisa', 'Keksitty']);
    // A daughter: a new child starts as a son.
    await fromBox(page, 'Matti', 'Add child…');
    await page.getByLabel('Given names').fill('Anna');
    await page.getByLabel('Surname').fill('Esimerkki');
    await page.getByLabel('Sex').selectOption('Female');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await boxOf(page, 'Anna').waitFor();
    await addRelative(page, 'Matti', 'Add sibling…', ['Pekka', 'Esimerkki']);
    expect(await page.locator('[data-box-key]').count()).toBe(6);

    // Pekka was Matti's son, not his brother.
    await fromBox(page, 'Pekka', 'Move to other parents…');
    const move = page.getByRole('dialog');
    await move.getByRole('combobox').fill('Matti');
    await page.getByRole('option', { name: 'Matti Esimerkki' }).click();
    await move.getByRole('button', { name: 'Move', exact: true }).click();
    await openSection(page, 'Family');
    const family = page.locator('sl-person-panel');
    await family
      .getByRole('button', { name: 'Father Matti Esimerkki' })
      .waitFor();
    await family
      .getByRole('button', { name: 'Sister Anna Esimerkki' })
      .waitFor();
    await shot(page, 'family-moved');

    await fromBox(page, 'Anna', 'Delete person…');
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await boxOf(page, 'Anna').waitFor({ state: 'detached' });
    expect(await page.locator('[data-box-key]').count()).toBe(5);
    await family
      .getByRole('button', { name: 'Sister Anna Esimerkki' })
      .waitFor({ state: 'detached' });
  });
});
