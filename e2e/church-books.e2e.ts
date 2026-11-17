// The Church books: a parish's Volumes downloaded and stopped, and a
// parish no source cites found in Astia and added.

import { afterAll, test } from 'bun:test';

import { closeBrowser, shot, withApp } from './app';
import { newTree, openList } from './steps';

afterAll(closeBrowser);

test("a parish's Volumes are downloaded and another parish found", async () => {
  await withApp(async ({ page }) => {
    await newTree(page);
    await openList(page, 'Church books');
    const list = page.locator('sl-church-books-list');
    await list.getByText('No sources here cite a church book.').waitFor();

    // Found by its name, its archive opens, and is listed with the others.
    await list.getByRole('button', { name: 'Find a parish in Astia' }).click();
    await list.getByLabel('Parish in Astia').fill('Keksitty');
    await list
      .getByRole('button', { name: 'Keksityn seurakunnan arkisto' })
      .click();
    await list.getByText('Keksityn seurakunnan arkisto').waitFor();
    const book = list.getByRole('listitem').filter({
      hasText: 'Rippikirja (1800-1810)'
    });
    await book.getByText('Not on disk').waitFor();

    // Downloaded an Image a second, until it's stopped.
    await book.getByRole('button', { name: 'Download' }).click();
    await book.getByText(/^Downloading \d+ of 5/).waitFor();
    await shot(page, 'church-books-downloading');
    await book.getByRole('button', { name: 'Stop' }).click();
    await book.getByText(/^Stopped at \d+ of 5/).waitFor();
    await book.getByRole('button', { name: 'Download' }).waitFor();

    await list.getByRole('button', { name: '‹ All archives' }).click();
    await list
      .getByRole('button', { name: 'Keksityn seurakunnan arkisto' })
      .waitFor();
  });
});
