// A MyHeritage reference placed by hand (ADR-0021, ADR-0033): its Estimate
// is where the reference points; another Volume of the Book can be looked
// at first; Place entry marks the line.

import { afterAll, expect, test } from 'bun:test';

import { closeBrowser, shot, withApp } from './app';
import { importTree, openJuvaVolume, rightClickLine } from './steps';

afterAll(closeBrowser);

test("a reference's entry is placed by hand", async () => {
  await withApp(async ({ page }) => {
    await importTree(page, 'myheritage-export.ged');
    await openJuvaVolume(page, 'Pää- ja rippikirjat (1790-1796)');
    await page.getByLabel('Image', { exact: true }).fill('12');
    await page.keyboard.press('Enter');
    const people = page.locator('sl-scan-people');
    await people.getByText('Estimate').waitFor();
    await people.getByRole('button', { name: /Matti Esimerkki/ }).click();

    // The Volumes of the Book, the one the reference fits first.
    await rightClickLine(page, 12, 3);
    await page.getByRole('menuitem', { name: 'Change Volume…' }).click();
    await page.getByText('Fits the reference').waitFor();
    await shot(page, 'manual-mark-volumes');
    await page.getByRole('button', { name: /I Aa:2/ }).click();
    await page.getByText('· Pää- ja rippikirjat (1797-1803)').waitFor();
    await page.getByText('No one in the tree is linked here.').waitFor();

    // Back in its own Volume, on its page, the entry placed on a line.
    await rightClickLine(page, 1, 1);
    await page.getByRole('menuitem', { name: 'Change Volume…' }).click();
    await page.getByRole('button', { name: /I Aa:1/ }).click();
    await page.getByText('· Pää- ja rippikirjat (1790-1796)').waitFor();
    expect(await page.getByLabel('Image', { exact: true }).inputValue()).toBe(
      '12'
    );
    await rightClickLine(page, 12, 3);
    await page.getByRole('menuitem', { name: /^Place entry/ }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await people.getByText('Marked').waitFor();
    await shot(page, 'manual-mark-marked');
  });
});
