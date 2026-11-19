// Vision Match in the Scan viewer (ADR-0029), with a vision model that
// finds the person on the Image asked: a MyHeritage export's estimate is
// located, and undone.

import { afterAll, expect, test } from 'bun:test';

import { closeBrowser, shot, withApp } from './app';
import { importTree, openJuvaVolume, turnAssistantOn } from './steps';
import { findsOn } from './vision';

afterAll(closeBrowser);

// Matti's rippikirja reference gives page 12, so he's estimated on Image 12.
test('an estimate is located on its Image, and undone', async () => {
  await withApp(
    async ({ page }) => {
      await importTree(page, 'myheritage-export.ged');
      await turnAssistantOn(page);
      await openJuvaVolume(page, 'Pää- ja rippikirjat (1790-1796)');
      await page.getByLabel('Image', { exact: true }).fill('12');
      await page.keyboard.press('Enter');
      const people = page.locator('sl-scan-people');
      await people.getByText('Estimate', { exact: true }).waitFor();

      await page
        .getByRole('img', { name: 'Image 12' })
        .click({ button: 'right', position: { x: 600, y: 500 } });
      await page
        .getByRole('menuitem', { name: /^Locate estimates on this Image/ })
        .click();
      // Its page numbers not checked, it asks first.
      await page.getByRole('menuitem', { name: 'Locate anyway' }).click();
      await page.getByText('Found 1 of 1').waitFor();
      await people.getByText('Match', { exact: true }).waitFor();
      await shot(page, 'vision-found');

      await page.getByRole('button', { name: 'Undo all' }).click();
      await people.getByText('Estimate', { exact: true }).waitFor();
      await shot(page, 'vision-undone');
    },
    { vision: findsOn(12) }
  );
});

// Confirmed, the Match is a Citation of the Image (ADR-0016), its Entry
// edited or deleted from then on.
test('a located estimate is confirmed', async () => {
  await withApp(
    async ({ page }) => {
      await importTree(page, 'myheritage-export.ged');
      await turnAssistantOn(page);
      await openJuvaVolume(page, 'Pää- ja rippikirjat (1790-1796)');
      await page.getByLabel('Image', { exact: true }).fill('12');
      await page.keyboard.press('Enter');
      const people = page.locator('sl-scan-people');
      await people.getByText('Estimate', { exact: true }).waitFor();
      await page
        .getByRole('img', { name: 'Image 12' })
        .click({ button: 'right', position: { x: 600, y: 500 } });
      await page
        .getByRole('menuitem', { name: /^Locate estimates on this Image/ })
        .click();
      // Its page numbers not checked, it asks first.
      await page.getByRole('menuitem', { name: 'Locate anyway' }).click();
      await people.getByRole('button', { name: /Matti Esimerkki/ }).click();

      const own = page.locator('[data-own]');
      await own.click({ button: 'right' });
      await page.getByRole('menuitem', { name: 'Confirm' }).click();
      await people.getByText('Match', { exact: true }).waitFor({
        state: 'detached'
      });
      await own.click({ button: 'right' });
      expect(await page.getByRole('menuitem').allInnerTexts()).toEqual([
        'Edit',
        'Delete',
        'Add reminder…'
      ]);
    },
    { vision: findsOn(12) }
  );
});
