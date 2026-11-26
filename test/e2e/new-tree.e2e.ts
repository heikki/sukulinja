// A new tree, built the way ADR-0033 starts one: from its first person,
// whose baptism in the church book is the first Entry and names the
// parents.

import { afterAll, expect, test } from 'bun:test';

import { closeBrowser, shot, withApp } from './app';
import { newTree, openJuvaVolume, openSection } from './steps';

afterAll(closeBrowser);

test("a tree grows from its first person's baptism", async () => {
  await withApp(async ({ page }) => {
    await newTree(page);
    expect(await page.locator('[data-box-key]').count()).toBe(1);

    // The baptism book, from the parish's archive in the Volume picker.
    await openJuvaVolume(page, 'Syntyneiden ja kastettujen luettelot');
    await page.getByText('No one in the tree is linked here.').waitFor();

    // The first line of its first page, his baptism.
    await page
      .getByRole('img', { name: 'Image 1' })
      .click({ button: 'right', position: { x: 250, y: 118 } });
    await page.getByRole('menuitem', { name: 'New entry' }).click();
    const kind = page.getByLabel('Kind of entry');
    expect(await kind.inputValue()).toBe('CHR');
    await page.getByRole('button', { name: 'Add father…' }).click();
    await page.getByRole('menuitem', { name: 'New father…' }).click();
    await page.getByLabel('Given names').fill('Juho');
    await page.getByLabel('Surname').fill('Esimerkki');
    await page.getByRole('button', { name: 'Name', exact: true }).click();
    await page.getByLabel('Born').fill('3.3.1795');
    await page.getByLabel('Baptised').fill('5.3.1795');
    await page.getByLabel('Place').fill('Esimerkkilä 2');
    // What the Entry offers the tree, ticked to be taken.
    const birth = page.getByLabel('Add fact: Birth 3.3.1795 at Esimerkkilä 2');
    expect(await birth.isChecked()).toBe(true);
    await shot(page, 'new-tree-entry');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('button', { name: 'Juho Esimerkki' }).waitFor();

    // The father is in the tree, and the child's Birth came from the Entry.
    await page.keyboard.press('Escape');
    const boxes = page.locator('[data-box-key]');
    await boxes.nth(1).waitFor();
    expect(await boxes.count()).toBe(2);
    await page
      .getByRole('button', { name: /Matti Esimerkki$/ })
      .first()
      .click();
    await openSection(page, 'Facts');
    await page.getByText('3.3.1795 · Esimerkkilä 2, Juva').waitFor();
    await shot(page, 'new-tree-done');
  });
});
