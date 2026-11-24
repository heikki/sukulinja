// The Volumes: a parish no source cites found in Astia from the Volume
// picker, one of its Volumes added to the Book list, downloaded and
// stopped there, removed from disk among all the books, and taken off; and the picker offering first the Volumes
// the Selected person's Facts fit.

import { afterAll, expect, test } from 'bun:test';

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
    // One of the install's other parishes can be removed again.
    await picker.getByRole('button', { name: 'Remove parish' }).waitFor();
    await shot(page, 'volumes-picker-other');
    await picker
      .getByRole('button', { name: 'Add I Aa:1 Rippikirja (1800-1810)' })
      .click();
    await picker.getByRole('button', { name: 'Added' }).waitFor();
    await shot(page, 'volumes-picker');
    await picker.getByRole('button', { name: 'Close' }).click();

    // On the list, downloaded an Image a second, until it's stopped.
    const book = list.getByRole('row').filter({ hasText: 'I Aa:1' });
    await book.getByText('1800–1810').waitFor();
    await book.getByRole('button', { name: 'Download' }).click();
    await book.getByText(/^Downloading \d+%/).waitFor();
    await shot(page, 'volumes-downloading');
    await book.getByRole('button', { name: 'Stop' }).click();
    await book.getByRole('button', { name: 'Download' }).waitFor();
    await book.getByText(/^\d+%$/).waitFor();

    // Opened in the Scan viewer, it's marked as the one shown.
    await book.getByRole('cell', { name: 'I Aa:1' }).click();
    await openList(page, 'Volumes');
    await list
      .locator('tr[aria-current="true"]', { hasText: 'I Aa:1' })
      .waitFor();
    await shot(page, 'volumes-shown');

    // Nothing else is on this computer, so all the books are the tree's
    // and aren't offered apart. Its page numbers are marked checked, for
    // every tree, and with no offload folder its trash button takes it off the disk,
    // asked first.
    expect(await list.getByRole('button', { name: 'This tree' }).count()).toBe(
      0
    );
    // Marked as having none first, then checked instead.
    const pages = book.getByRole('cell').nth(4);
    await pages.click({ button: 'right' });
    await shot(page, 'volumes-pages-menu');
    await page
      .getByRole('menuitem', { name: 'Mark as no page numbers' })
      .click();
    await book.getByText('None', { exact: true }).waitFor();
    await shot(page, 'volumes-no-pages');
    await pages.click({ button: 'right' });
    await page
      .getByRole('menuitem', { name: 'Unmark no page numbers' })
      .click();
    // Done, as a row's menu waits while anything is being done.
    await book
      .getByText('None', { exact: true })
      .waitFor({ state: 'detached' });
    await pages.click({ button: 'right' });
    await page
      .getByRole('menuitem', { name: 'Mark page numbers checked' })
      .click();
    await book.getByText('Checked').waitFor();
    await shot(page, 'volumes-checked');
    await book.getByRole('button', { name: 'Remove from disk' }).click();
    const ask = page.getByRole('alertdialog', {
      name: 'Remove I Aa:1 from disk?'
    });
    await ask.getByRole('button', { name: 'Remove' }).click();

    // Cited by nothing, the same button then takes it off the list.
    await book.getByRole('button', { name: 'Remove from the list' }).click();
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

    // A parish picked, its Volumes scroll up past what fits him.
    await page
      .getByRole('dialog', { name: 'Add volumes' })
      .getByRole('button', { name: 'Juvan seurakunnan arkisto' })
      .click();
    expect(
      await fits.evaluate((el) => {
        const main = el.parentElement?.getBoundingClientRect();
        return (
          main !== undefined &&
          el.getBoundingClientRect().bottom <= main.top + 1
        );
      })
    ).toBe(true);
    await shot(page, 'volumes-parish');
  });
});

test('the This tree / All books choice is kept as the tab closes and opens', async () => {
  await withApp(async ({ page }) => {
    // A Volume partly downloaded for one tree is on this computer, off
    // another's Book list.
    await newTree(page);
    await openList(page, 'Volumes');
    const list = page.locator('sl-volumes-list');
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
    await picker.getByRole('button', { name: 'Added' }).waitFor();
    await picker.getByRole('button', { name: 'Close' }).click();
    const book = list.getByRole('row').filter({ hasText: 'I Aa:1' });
    await book.getByRole('button', { name: 'Download' }).click();
    await book.getByText(/^Downloading \d+%/).waitFor();
    await book.getByRole('button', { name: 'Stop' }).click();
    await book.getByRole('button', { name: 'Download' }).waitFor();

    await page.goto(new URL('/', page.url()).toString());
    await importTree(page, 'myheritage-export.ged', 'Toinen suku');
    await openList(page, 'Volumes');
    await list.getByRole('button', { name: 'All books' }).click();
    const allPressed = list.locator(
      'button[aria-pressed="true"]:has-text("All books")'
    );
    await allPressed.waitFor();

    // Kept past the Photos tab and past the lists closed.
    await openList(page, 'Photos');
    await openList(page, 'Volumes');
    await allPressed.waitFor();
    await page.getByRole('button', { name: /^Volumes, Photos/ }).click();
    await openList(page, 'Volumes');
    await allPressed.waitFor();
  });
});
