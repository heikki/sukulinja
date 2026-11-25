// The Scan viewer and the Photo viewer open again on a reload as they
// were left, and stay closed once closed.

import { afterAll, expect, test } from 'bun:test';
import { resolve } from 'node:path';

import { closeBrowser, withApp } from './app';
import {
  importTree,
  newTree,
  openJuvaVolume,
  openList,
  openSection
} from './steps';

afterAll(closeBrowser);

test('the Scan viewer opens again on the Image it was left on', async () => {
  await withApp(async ({ page }) => {
    await newTree(page);
    await openJuvaVolume(page, 'Pää- ja rippikirjat (1790-1796)');
    await page.getByRole('img', { name: 'Image 1' }).waitFor();
    await page.getByRole('button', { name: 'Next image' }).click();
    await page.getByRole('img', { name: 'Image 2' }).waitFor();

    await page.reload();
    await page.getByRole('img', { name: 'Image 2' }).waitFor();

    await page.keyboard.press('Escape');
    const viewer = page.getByRole('region', { name: 'Scan viewer' });
    await viewer.waitFor({ state: 'detached' });
    await page.reload();
    await page.locator('[data-box-key]').first().waitFor();
    expect(await viewer.count()).toBe(0);
  });
});

test('the Photo viewer opens again on the Photo it was left on', async () => {
  await withApp(async ({ page }) => {
    await newTree(page);
    await openList(page, 'Photos');
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Add photos…' }).click();
    await (
      await chooser
    ).setFiles([
      resolve(import.meta.dir, 'fixtures/church-book-page.jpg'),
      resolve(import.meta.dir, '../../resources/icon.iconset/icon_256x256.png')
    ]);
    await page.getByText('Photo 1 of 2').waitFor();
    await page.keyboard.press('ArrowRight');
    await page.getByText('Photo 2 of 2').waitFor();

    await page.reload();
    await page.getByText('Photo 2 of 2').waitFor();
  });
});

test('the Scan viewer opens again on the source it was left on', async () => {
  await withApp(async ({ page }) => {
    await importTree(page, 'myheritage-export.ged');
    await openSection(page, 'Sources');
    await page.locator('sl-person-sources button.title').first().click();
    const viewer = page.getByRole('region', { name: 'Scan viewer' });
    const scan = viewer.getByRole('img', { name: /^Image \d+$/ });
    await scan.waitFor();
    const name = await scan.getAttribute('alt');
    expect(name).toMatch(/^Image \d+$/);

    await page.reload();
    await scan.waitFor();
    expect(await scan.getAttribute('alt')).toBe(name);
  });
});
