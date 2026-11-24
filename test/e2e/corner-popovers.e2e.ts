// Settings and the corner's lists, switched from one to the other: the
// open one closes as the other opens, on the click, not a press earlier.

import { afterAll, expect, test } from 'bun:test';

import { closeBrowser, withApp } from './app';
import { newTree } from './steps';

afterAll(closeBrowser);

test('a press on the other corner button switches popovers at once', async () => {
  await withApp(async ({ page }) => {
    await newTree(page);
    const settings = page.getByRole('group', { name: 'Settings' });
    const lists = page.getByRole('tab', { name: 'Volumes' });

    await page.getByRole('button', { name: 'Settings' }).click();
    await settings.waitFor();

    const listsButton = page.getByRole('button', { name: /^Volumes, Photos/ });
    const box = await listsButton.boundingBox();
    if (box === null) throw new Error('No lists button');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    expect(await settings.isVisible()).toBe(true);
    await page.mouse.up();
    await lists.waitFor();
    await settings.waitFor({ state: 'detached' });

    // And back.
    await page.getByRole('button', { name: 'Settings' }).click();
    await settings.waitFor();
    await lists.waitFor({ state: 'detached' });

    // A press anywhere else still closes on the press.
    await page.mouse.move(400, 400);
    await page.mouse.down();
    await settings.waitFor({ state: 'detached' });
    await page.mouse.up();
  });
});
