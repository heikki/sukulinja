// The view in the URL: the tree's Root and the Selected person survive a
// reload, Build tree from here makes a new Root, and Back goes to the last.

import { afterAll, expect, test } from 'bun:test';

import { closeBrowser, withApp } from './app';
import { addRelative, boxOf, fromBox, newTree } from './steps';

afterAll(closeBrowser);

test('the URL keeps the view through a reload and Back', async () => {
  await withApp(async ({ page }) => {
    await newTree(page);
    await addRelative(page, 'Matti', 'Add father…', ['Juho', 'Esimerkki']);
    await addRelative(page, 'Juho', 'Add father…', ['Pekka', 'Esimerkki']);
    // The Selected person, by the name on the dock's rail.
    async function selected(name: string) {
      await page
        .locator('sl-side-dock .rail-heading')
        .filter({ hasText: name })
        .waitFor({ state: 'attached' });
    }

    // Juho selected, in a tree whose Root is still Matti.
    await boxOf(page, 'Juho').click();
    await selected('Juho Esimerkki');
    await page.waitForURL(/#\/person\/1\?sel=2/);
    await page.reload();
    await selected('Juho Esimerkki');
    await boxOf(page, 'Pekka').waitFor();
    expect(page.url()).toMatch(/#\/person\/1\?sel=2/);

    // Pekka's tree, which has only him and his descendants.
    await fromBox(page, 'Pekka', 'Build tree from here');
    await page.waitForURL(/#\/person\/3(?:\?|$)/);
    await selected('Pekka Esimerkki');

    await page.goBack();
    await page.waitForURL(/#\/person\/1(?:\?|$)/);
    await page.goForward();
    await page.waitForURL(/#\/person\/3(?:\?|$)/);
    await page.reload();
    await selected('Pekka Esimerkki');
    await boxOf(page, 'Matti').waitFor();
  });
});
