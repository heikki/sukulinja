// A source in the person panel's Sources: its Citation deleted, asked
// first as every step that takes something away is.

import { afterAll, expect, test } from 'bun:test';

import { closeBrowser, shot, withApp } from './app';
import { importTree, openSection } from './steps';

afterAll(closeBrowser);

test("a source's citation is deleted after asking", async () => {
  await withApp(async ({ page }) => {
    await importTree(page, 'myheritage-export.ged');
    await openSection(page, 'Sources');
    const sources = page.locator('sl-person-sources article');
    const before = await sources.count();
    await page
      .locator('sl-person-sources')
      .getByRole('button', { name: 'Show the record' })
      .first()
      .click();
    const remove = page.getByRole('button', { name: 'Delete citation' });

    // Cancelled, nothing goes.
    await remove.click();
    const ask = page.getByRole('alertdialog', { name: 'Delete citation?' });
    await ask.waitFor();
    await shot(page, 'sources-delete-asked');
    await ask.getByRole('button', { name: 'Cancel' }).click();
    await ask.waitFor({ state: 'detached' });
    expect(await sources.count()).toBe(before);

    await remove.click();
    await ask.getByRole('button', { name: 'Delete' }).click();
    await ask.waitFor({ state: 'detached' });
    await sources.nth(before - 1).waitFor({ state: 'detached' });
    await shot(page, 'sources-deleted');
  });
});
