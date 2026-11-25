// The details dock opens and closes only from its own header and rail:
// not on a select, not on Space, and not on a Space typed in its header.

import { afterAll, expect, test } from 'bun:test';

import { closeBrowser, withApp } from './app';
import { boxOf, newTree, openDock } from './steps';

afterAll(closeBrowser);

test('only the dock opens and closes itself', async () => {
  await withApp(async ({ page }) => {
    await newTree(page);
    const open = page.locator('sl-side-dock[open]');

    // Selecting leaves it closed, and Space on the chart does nothing.
    await boxOf(page, 'Matti').click();
    await page.keyboard.press(' ');
    expect(await open.count()).toBe(0);

    // Space typed into the name form in its header keeps it open.
    await openDock(page);
    await page.getByTitle('Change the name').click();
    await page.getByLabel('Given names').pressSequentially(' Juhani');
    expect(await page.getByLabel('Given names').inputValue()).toBe(
      'Matti Juhani'
    );
    expect(await open.count()).toBe(1);
    await page.keyboard.press('Escape');

    // Its header's button closes it.
    await page.getByRole('button', { name: 'Hide the details' }).click();
    await page.locator('sl-side-dock:not([open])').waitFor();
  });
});
