// A MyHeritage reference placed by hand (ADR-0021, ADR-0033): its Estimate
// is where the reference points; another Volume of the Book can be looked
// at first; Place entry marks the line, making it a Citation of the Image.

import { afterAll, expect, test } from 'bun:test';
import { rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { closeBrowser, shot, withApp } from './app';
import { importTree, openJuvaVolume, openList, rightClickLine } from './steps';

afterAll(closeBrowser);

// The images on disk a Volume's Downloaded title counts.
function count(title: string | null) {
  return Number(/(?<n>\d+) of /.exec(title ?? '')?.groups?.n);
}

test("a reference's entry is placed by hand", async () => {
  await withApp(async ({ page, dataDir }) => {
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
    // Placed with an Entry's card beside the scan, as Edit's is.
    const card = page.locator('sl-scan-entry');
    await card.getByText('Place entry').waitFor();
    await card.getByLabel('Kind of entry').waitFor();
    await shot(page, 'manual-mark-placing');
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

    // Offloaded, the Volume keeps only its cited Image on disk, the rest
    // moved into the offload folder chosen in Settings.
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('button', { name: 'Choose…' }).click();
    await page.getByTitle(/sukulinja-e2e-.*offload$/m).waitFor();
    await shot(page, 'manual-mark-offload-folder');
    await page.keyboard.press('Escape');
    await openList(page, 'Volumes');
    const list = page.locator('sl-volumes-list');
    // Another Volume was looked at, so every book on this computer is
    // offered beside the tree's.
    await list.getByRole('button', { name: 'All books' }).click();
    await list.getByRole('row').filter({ hasText: 'I Aa:2' }).waitFor();
    const row = list.getByRole('row').filter({ hasText: 'I Aa:1' });
    // With the folder chosen, its trash button offloads it, unasked, and
    // says first what that frees.
    const downloaded = row.locator('td').nth(5);
    const had = await downloaded.getAttribute('title');
    const offload = row.getByRole('button', { name: 'Offload' });
    await offload.hover();
    await row.locator('button[title^="Offload: frees "]').waitFor();
    await offload.click();
    await row.locator('td[title^="Offloaded: "]').waitFor();
    expect(
      await row.getByRole('button', { name: 'Download' }).getAttribute('title')
    ).toMatch(/^Download: brought back from the offload folder/);
    await shot(page, 'manual-mark-offloaded');

    // With the folder's drive away, an Image moved there says so, and
    // shows once the drive is back.
    const folder = join(dirname(dataDir), 'offload');
    await rename(folder, `${folder}-away`);
    await page.getByLabel('Image', { exact: true }).fill('13');
    await page.keyboard.press('Enter');
    await page.getByText('Offload folder not connected').waitFor();
    await page.keyboard.press('Escape');
    await shot(page, 'manual-mark-folder-away');
    await rename(`${folder}-away`, folder);
    await page.getByRole('button', { name: 'Retry' }).click();
    await page.getByText('Offload folder not connected').waitFor({
      state: 'detached'
    });
    expect(await page.getByText('Offloaded', { exact: true }).count()).toBe(0);

    // Off its cited Image and the ones moved away, nothing is fetched until
    // it's downloaded again.
    await page.getByLabel('Image', { exact: true }).fill('18');
    await page.keyboard.press('Enter');
    await page.getByText('Offloaded', { exact: true }).waitFor();
    await openList(page, 'Volumes');
    await row.getByRole('button', { name: 'Download' }).click();
    await row.getByRole('button', { name: 'Offload' }).waitFor();
    // Back from the offload folder, all it had is on disk again, and only
    // the rest comes from Astia.
    expect(
      count(await downloaded.getAttribute('title'))
    ).toBeGreaterThanOrEqual(count(had));
    await shot(page, 'manual-mark-brought-back');

    // Offloaded, the other Volume's trash button then removes it from the
    // folder too, asked first, and it's gone from this computer.
    const other = list.getByRole('row').filter({ hasText: 'I Aa:2' });
    await other.getByRole('button', { name: 'Offload' }).click();
    await other.getByRole('button', { name: 'Remove for good' }).click();
    await shot(page, 'manual-mark-for-good');
    await page
      .getByRole('alertdialog', { name: 'Remove I Aa:2 for good?' })
      .getByRole('button', { name: 'Remove' })
      .click();
    await other.waitFor({ state: 'detached' });
  });
});
