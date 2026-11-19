// A MyHeritage reference placed by hand (ADR-0021, ADR-0033): its Estimate
// is where the reference points; another Volume of the Book can be looked
// at first; Place entry marks the line, making it a Citation of the Image.

import { afterAll, expect, test } from 'bun:test';

import { closeBrowser, shot, withApp } from './app';
import { importTree, openJuvaVolume, openList, rightClickLine } from './steps';

afterAll(closeBrowser);

test("a reference's entry is placed by hand", async () => {
  await withApp(async ({ page }) => {
    await importTree(page, 'myheritage-export.ged');
    await openJuvaVolume(page, 'Pää- ja rippikirjat (1790-1796)');
    await page.getByLabel('Image', { exact: true }).fill('12');
    await page.keyboard.press('Enter');
    const people = page.locator('sl-scan-people');
    await people.getByText('Estimate').waitFor();
    const cited = people.getByRole('navigation', { name: 'Cited images' });
    expect(
      await cited
        .getByRole('button', { name: '12' })
        .getAttribute('aria-current')
    ).toBe('true');
    await shot(page, 'manual-mark-cited');
    await people.getByRole('button', { name: /Matti Esimerkki/ }).click();

    // The Volumes of the Book, the one the reference fits first.
    await rightClickLine(page, 12, 3);
    await page.getByRole('menuitem', { name: 'Change Volume…' }).click();
    await page.getByRole('region', { name: 'Fits the reference' }).waitFor();
    await shot(page, 'manual-mark-volumes');
    await page
      .getByRole('button', { name: /^Open .*I Aa:2/ })
      .first()
      .click();
    await page.getByText('· Pää- ja rippikirjat (1797-1803)').waitFor();
    await page.getByText('No one in the tree is linked here.').waitFor();

    // Back in its own Volume, on its page, the entry placed on a line.
    await rightClickLine(page, 1, 1);
    await page.getByRole('menuitem', { name: 'Change Volume…' }).click();
    await page
      .getByRole('button', { name: /^Open .*I Aa:1/ })
      .first()
      .click();
    await page.getByText('· Pää- ja rippikirjat (1790-1796)').waitFor();
    expect(await page.getByLabel('Image', { exact: true }).inputValue()).toBe(
      '12'
    );
    await rightClickLine(page, 12, 3);
    await page.getByRole('menuitem', { name: /^Place entry/ }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await people.getByText('Marked').waitFor();
    await shot(page, 'manual-mark-marked');

    // The reference is now a Citation of the Image (ADR-0016): its Entry
    // is edited or deleted; another Volume is still a right-click away.
    await page.locator('[data-own]').click({ button: 'right' });
    expect(await page.getByRole('menuitem').allInnerTexts()).toEqual([
      'Edit',
      'Delete',
      'Add reminder…'
    ]);
    await page.keyboard.press('Escape');
    await rightClickLine(page, 12, 1);
    expect(await page.getByRole('menuitem').allInnerTexts()).toEqual([
      'New entry',
      'Add reminder…',
      'Change Volume…'
    ]);
    await page.keyboard.press('Escape');

    // Offloaded, the Volume keeps only its cited Image on disk.
    await openList(page, 'Volumes');
    const list = page.locator('sl-volumes-list');
    await list
      .getByRole('group', { name: 'Volumes shown' })
      .getByRole('button', { name: 'All books' })
      .click();
    const row = list
      .locator('sl-all-books')
      .getByRole('row')
      .filter({ hasText: 'I Aa:1' });
    await row.getByRole('button', { name: 'Offload' }).click();
    await row.getByText('Keep only the cited images on disk?').waitFor();
    await row.getByRole('button', { name: 'Offload', exact: true }).click();
    await row.locator('td[title^="1 of 20 Images on disk"]').waitFor();
    await shot(page, 'manual-mark-offloaded');
  });
});
