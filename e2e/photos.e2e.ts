// Photos added to a dataset and the people in them tagged: the first
// Photo someone is tagged in is their portrait, until another is chosen;
// a tag and a Photo can be deleted.

import { afterAll, expect, test } from 'bun:test';
import { resolve } from 'node:path';

import type { Page } from 'playwright';

import { closeBrowser, shot, withApp } from './app';
import { boxOf, newTree, openList } from './steps';

afterAll(closeBrowser);

const PHOTOS = [
  resolve(import.meta.dir, 'fixtures/church-book-page.jpg'),
  resolve(import.meta.dir, '../resources/icon.iconset/icon_256x256.png')
];

// A right-click on the Photo shown, `x` and `y` across it.
async function rightClickPhoto(page: Page, x: number, y: number) {
  const viewer = page.getByRole('region', { name: 'Photo viewer' });
  const at = await viewer.getByRole('img', { name: 'Photo' }).boundingBox();
  if (at === null) throw new Error("the Photo isn't shown");
  await page.mouse.click(at.x + at.width * x, at.y + at.height * y, {
    button: 'right'
  });
}

// Someone tagged on the Photo shown, chosen from those the menu offers.
async function tag(page: Page, x: number, y: number, who: string) {
  await rightClickPhoto(page, x, y);
  await page.getByRole('menuitem', { name: 'Tag someone here…' }).click();
  await page.getByRole('menuitem', { name: who }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByText(/^Tagging /).waitFor({ state: 'detached' });
}

// The portrait shown in the person's box, once it's drawn.
async function portraitOf(page: Page, name: string) {
  const portrait = boxOf(page, name).locator('image.avatar-img');
  await portrait.waitFor();
  return await portrait.getAttribute('href');
}

test('people are tagged in photos, one their portrait', async () => {
  await withApp(async ({ page }) => {
    await newTree(page);
    expect(await boxOf(page, 'Matti').locator('image').count()).toBe(0);

    // Both added at once; the first one opens.
    await openList(page, 'Photos');
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Add photos…' }).click();
    await (await chooser).setFiles(PHOTOS);
    await page.getByText('Photo 1 of 2').waitFor();

    // Tagged in the first, it's his portrait.
    await tag(page, 0.3, 0.3, 'Matti Esimerkki');
    const people = page.getByRole('region', { name: 'Photo viewer' });
    await people.getByRole('button', { name: /Matti Esimerkki/ }).waitFor();
    await shot(page, 'photos-tagged');

    // His father tagged as he's added, from the same menu.
    await rightClickPhoto(page, 0.7, 0.3);
    await page.getByRole('menuitem', { name: 'Tag someone here…' }).click();
    await page.getByRole('menuitem', { name: 'New father…' }).click();
    await page.getByLabel('Given names').fill('Juho');
    await page.getByLabel('Surname').fill('Esimerkki');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await people.getByRole('button', { name: /Juho Esimerkki/ }).waitFor();

    await page.keyboard.press('Escape');
    const first = await portraitOf(page, 'Matti');
    expect(first).not.toBeNull();
    await boxOf(page, 'Juho').locator('image.avatar-img').waitFor();

    // In the other, the portrait isn't his until it's chosen.
    await openList(page, 'Photos');
    await page.getByRole('button', { name: 'Photo, no one' }).click();
    await tag(page, 0.5, 0.5, 'Matti Esimerkki');
    await page.locator('[data-key]').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Use as portrait' }).click();
    await page.keyboard.press('Escape');
    await boxOf(page, 'Matti')
      .locator(`image.avatar-img:not([href="${first}"])`)
      .waitFor();
    await openList(page, 'Photos');
    await page.getByRole('button', { name: 'Photo, 1 person' }).click();
    await page.locator('[data-key]').click({ button: 'right' });
    expect(await page.getByRole('menuitem').allInnerTexts()).toEqual([
      'Edit',
      'Delete'
    ]);

    // His tag taken off it, then the other Photo deleted.
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await page.getByText('Delete the tag of Matti Esimerkki?').waitFor();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.getByText('No one is linked to or tagged here.').waitFor();

    await page.keyboard.press('Escape');
    await openList(page, 'Photos');
    await page.getByRole('button', { name: 'Photo, 2 people' }).click();
    await rightClickPhoto(page, 0.5, 0.9);
    await page.getByRole('menuitem', { name: 'Delete photo…' }).click();
    await page
      .getByText('Delete this photo and take it off the 2 people in it?')
      .waitFor();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.keyboard.press('Escape');
    await openList(page, 'Photos');
    await page
      .getByRole('button', { name: /^Photo, / })
      .first()
      .waitFor();
    expect(await page.getByRole('button', { name: /^Photo, / }).count()).toBe(
      1
    );
  });
});
