// A Volume's page numbers (ADR-0032), shown where Settings asks for them:
// read by a page survey, counted between, corrected by hand, and cleared.

import { afterAll, test } from 'bun:test';

import { closeBrowser, shot, withApp } from './app';
import { newTree, openJuvaVolume, turnAssistantOn } from './steps';
import { findsOn } from './vision';

afterAll(closeBrowser);

test("a Volume's page numbers are surveyed, corrected and cleared", async () => {
  await withApp(
    async ({ page }) => {
      await newTree(page);
      await turnAssistantOn(page);
      await page.getByRole('button', { name: 'Settings' }).click();
      await page
        .getByRole('group', { name: 'Page numbers' })
        .getByRole('button', { name: 'On' })
        .click();
      await page.keyboard.press('Escape');
      await openJuvaVolume(page, 'Pää- ja rippikirjat (1790-1796)');
      const bubble = page.locator('sl-scan-page');

      // Each Image's page is read six past its number.
      await page
        .getByRole('img', { name: 'Image 1' })
        .click({ button: 'right', position: { x: 600, y: 500 } });
      await page
        .getByRole('menuitem', { name: /^Survey page numbers/ })
        .click();
      await page.getByText(/^Page numbers read on \d+ Images/).waitFor();
      await bubble.getByRole('button', { name: /^page 7/ }).waitFor();
      await shot(page, 'page-numbers-surveyed');
      await page.getByRole('button', { name: 'Close', exact: true }).click();

      // Image 2 is counted from those read, then set by hand.
      await page.getByRole('button', { name: 'Next image' }).click();
      await bubble.getByRole('button', { name: '≈ page 8' }).click();
      await bubble.getByLabel('Page').fill('20');
      await page.keyboard.press('Enter');
      await bubble.getByRole('button', { name: 'page 20' }).waitFor();
      await bubble.getByRole('button', { name: 'Take away this page' }).click();
      await bubble.getByRole('button', { name: '≈ page 8' }).waitFor();

      // Cleared, the Images are counted from the first again.
      await page
        .getByRole('img', { name: 'Image 2' })
        .click({ button: 'right', position: { x: 600, y: 500 } });
      await page.getByRole('menuitem', { name: /^Clear page numbers/ }).click();
      await page
        .getByText('Takes away the page numbers read or set on 2 Images')
        .waitFor();
      await page.getByRole('menuitem', { name: 'Clear page numbers' }).click();
      await bubble.getByRole('button', { name: '≈ page 2' }).waitFor();
    },
    { vision: findsOn(0, (image) => [image + 6]) }
  );
});
