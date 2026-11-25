// The details dock opens and closes only from its own header and rail:
// not on a select, not on Space, and not on a Space typed in its header.
// It and its sections are left open or closed as they were, across a
// reload.

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

    // It's open again after a reload, as it was left, and so are its
    // sections, as Events once opened.
    const panel = page.locator('sl-person-panel');
    await panel
      .getByRole('button', { name: 'Events', expanded: false })
      .click();
    await page.reload();
    await open.waitFor();
    await panel
      .getByRole('button', { name: 'Events', expanded: true })
      .waitFor();

    // Its header's button closes it, and it stays closed after a reload.
    await page.getByRole('button', { name: 'Hide the details' }).click();
    await page.locator('sl-side-dock:not([open])').waitFor();
    await page.reload();
    await page.locator('sl-side-dock:not([open])').waitFor();
    expect(await open.count()).toBe(0);
  });
});

test('the chart is where it was left beside the open dock', async () => {
  await withApp(async ({ page }) => {
    await newTree(page);
    await openDock(page);
    // Dragged once the dock has slid open, and let settle.
    await page.waitForTimeout(500);
    const canvas = await page.locator('.canvas').boundingBox();
    if (canvas === null) throw new Error("the chart isn't shown");
    await page.mouse.move(canvas.x + 300, canvas.y + 300);
    await page.mouse.down();
    await page.mouse.move(canvas.x + 400, canvas.y + 350, { steps: 10 });
    await page.mouse.up();
    await page.waitForURL(/pan=/);
    await page.waitForTimeout(500);
    const left = await boxOf(page, 'Matti').boundingBox();

    await page.reload();
    await page.locator('sl-side-dock[open]').waitFor();
    await page.waitForTimeout(500);
    expect(await boxOf(page, 'Matti').boundingBox()).toEqual(left);
  });
});
