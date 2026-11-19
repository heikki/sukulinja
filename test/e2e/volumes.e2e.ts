// The Volumes: a parish no source cites found in Astia from the Volume
// picker, one of its Volumes added to the Book list, downloaded and
// stopped there, and taken off.

import { afterAll, test } from 'bun:test';

import { closeBrowser, shot, withApp } from './app';
import { newTree, openList } from './steps';

afterAll(closeBrowser);

test('a Volume of another parish is added, downloaded and taken off', async () => {
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
    await book.getByText(/^Downloading \d+ of 5/).waitFor();
    await shot(page, 'volumes-downloading');
    await book.getByRole('button', { name: 'Stop' }).click();
    await book.getByText(/^Stopped at \d+ of 5/).waitFor();

    // Cited by nothing, it comes off the list.
    await book.getByRole('button', { name: 'Remove' }).click();
    await list.getByText('No sources here cite a Volume yet.').waitFor();
  });
});
