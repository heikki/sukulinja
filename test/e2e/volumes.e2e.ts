// The Volumes: a parish no source cites found in Astia from the Volume
// picker, one of its Volumes added to the Book list, downloaded and
// stopped there, removed from disk among all the books, and taken off; and the picker offering first the Volumes
// the Selected person's Facts fit.

import { afterAll, test } from 'bun:test';

import { closeBrowser, shot, withApp } from './app';
import { importTree, newTree, openList } from './steps';

afterAll(closeBrowser);

test('a Volume of another parish is added, downloaded, removed and taken off', async () => {
  await withApp(async ({ page }) => {
    await newTree(page);
    await openList(page, 'Volumes');
    const list = page.locator('sl-volumes-list');
    await list.getByText('No sources here cite a Volume yet.').waitFor();

    // Found by its name in the picker, its archive opens there.
    await list.getByRole('button', { name: 'Add volumes…' }).click();
    const picker = page.getByRole('dialog', { name: 'Add volumes' });
    await picker
      .getByRole('button', { name: '+ Find a parish in Astia' })
      .click();
    await picker.getByLabel('Parish in Astia').fill('Keksitty');
    await picker
      .getByRole('button', { name: 'Keksityn seurakunnan arkisto' })
      .click();
    await picker
      .getByRole('button', { name: 'Add I Aa:1 Rippikirja (1800-1810)' })
      .click();
    await picker.getByText('On list').waitFor();
    await shot(page, 'volumes-picker');
    await picker.getByRole('button', { name: 'Close' }).click();

    // On the list, downloaded an Image a second, until it's stopped.
    const book = list.getByRole('row').filter({ hasText: 'I Aa:1' });
    await book.getByText('1800–1810').waitFor();
    await book.getByRole('button', { name: 'Download' }).click();
    await book.getByText(/^Downloading \d+%/).waitFor();
    await shot(page, 'volumes-downloading');
    await book.getByRole('button', { name: 'Stop' }).click();
    await book.getByText(/^Stopped at \d+%/).waitFor();

    // Among all the books on this computer, it comes off the disk.
    const modes = list.getByRole('group', { name: 'Volumes shown' });
    await modes.getByRole('button', { name: 'All books' }).click();
    const all = list.locator('sl-all-books');
    await all.getByText('Keksityn seurakunnan arkisto').waitFor();
    await shot(page, 'volumes-all-books');
    await all
      .getByRole('row')
      .filter({ hasText: 'I Aa:1' })
      .getByRole('button', { name: 'Remove from disk' })
      .click();
    await all.getByText('Nothing of any volume is on this computer').waitFor();
    await modes.getByRole('button', { name: 'This tree' }).click();

    // Cited by nothing, it comes off the list.
    await book.getByRole('button', { name: 'Remove' }).click();
    await list.getByText('No sources here cite a Volume yet.').waitFor();
  });
});

test("the picker offers the Volumes the Selected person's Facts fit", async () => {
  await withApp(async ({ page }) => {
    await importTree(page, 'myheritage-export.ged');
    await openList(page, 'Volumes');
    await page.getByRole('button', { name: 'Add volumes…' }).click();

    // Born in Juva in 1780, Matti is in its rippikirja of his childhood.
    const fits = page
      .getByRole('dialog', { name: 'Add volumes' })
      .getByRole('region', { name: 'Fits Matti Esimerkki' });
    await fits
      .getByRole('button', {
        name: 'Open I Aa:1 Pää- ja rippikirjat (1790-1796)'
      })
      .waitFor();
    await shot(page, 'volumes-fits');
  });
});
