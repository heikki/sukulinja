// A dataset exported as its GEDZIP (ADR-0013) comes back whole when the
// file is imported: the tree's one copy outside the app.

import { afterAll, expect, test } from 'bun:test';
import { join, resolve } from 'node:path';

import type { Page } from 'playwright';

import { closeBrowser, shot, withApp } from './app';
import { importTree, openList } from './steps';

afterAll(closeBrowser);

// How many photos the dataset's Photos list holds.
async function photosOf(page: Page, slug: string) {
  await page.goto(new URL(`/d/${slug}/`, page.url()).toString());
  await openList(page, 'Photos');
  const photos = page.getByRole('button', { name: /^Photo, / });
  await photos.first().waitFor();
  return await photos.count();
}

// The demo the app ships, with its photos.
const DEMO = resolve(import.meta.dir, '../resources/demo/bourbon.gdz');

test('an exported GEDZIP imports back as the same tree', async () => {
  await withApp(async ({ page, exportDir }) => {
    await importTree(page, DEMO, 'Bourbon');
    await page.goto(new URL('/', page.url()).toString());

    await page.getByRole('button', { name: 'More for Bourbon' }).click();
    await page.getByRole('menuitem', { name: /^Export GEDZIP/ }).click();
    const saved = join(exportDir, 'bourbon.gdz');
    await page.getByText(`Exported Bourbon as GEDZIP to ${saved}.`).waitFor();

    await importTree(page, saved, 'Takaisin');
    await page.goto(new URL('/', page.url()).toString());
    const sizes = page.getByText(/\d+ people · \d+ families/);
    await sizes.nth(1).waitFor();
    const [before, after] = await sizes.allInnerTexts();
    expect(after).toBe(before);
    await shot(page, 'gedzip-round-trip');
    expect(await photosOf(page, 'takaisin')).toBe(
      await photosOf(page, 'bourbon')
    );
  });
});
