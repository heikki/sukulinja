// A Volume's page numbers (ADR-0032), shown where Settings asks for them:
// read by a page survey, counted between, corrected by hand, cleared and
// marked checked, those from its row's right-click menu in the Volumes
// tab.

import { afterAll, test } from 'bun:test';

import type { Page } from 'playwright';

import { closeBrowser, shot, withApp } from './app';
import { newTree, openJuvaVolume, openList, turnAssistantOn } from './steps';
import { findsOn } from './vision';

afterAll(closeBrowser);

// Picks the step from the menu of the shown Volume's page numbers.
async function fromPagesMenu(page: Page, step: string) {
  await openList(page, 'Volumes');
  const list = page.locator('sl-volumes-list');
  const all = list.getByRole('button', { name: 'All books' });
  if ((await all.getAttribute('aria-pressed').catch(() => null)) === 'false') {
    await all.click();
  }
  await list
    .locator('tr[aria-current="true"] td')
    .nth(4)
    .click({ button: 'right' });
  await page.getByRole('menuitem', { name: step }).click();
}

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
      await page.getByRole('img', { name: 'Image 1' }).waitFor();
      await fromPagesMenu(page, 'Survey page numbers');
      await page.getByText(/^Page numbers read on \d+ Images/).waitFor();
      await page.keyboard.press('Escape');
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
      await fromPagesMenu(page, 'Clear page numbers');
      await page
        .getByText('Takes away the page numbers read or set on 2 Images')
        .waitFor();
      await page.getByRole('menuitem', { name: 'Clear page numbers' }).click();
      await page.keyboard.press('Escape');
      await bubble.getByRole('button', { name: '≈ page 2' }).waitFor();

      // Image 2 left out of the counting, then the page numbers marked
      // checked: locked, and nothing shown on it.
      await bubble.getByRole('button', { name: '≈ page 2' }).click();
      await bubble.getByLabel('Page').fill('');
      await page.keyboard.press('Enter');
      await bubble.getByRole('button', { name: 'skipped' }).waitFor();
      await fromPagesMenu(page, 'Mark page numbers checked');
      await page
        .locator('sl-volumes-list tr[aria-current="true"]')
        .getByText('Checked')
        .waitFor();
      await page.keyboard.press('Escape');
      await bubble.getByText('skipped').waitFor({ state: 'detached' });
      await page.getByRole('button', { name: 'Previous image' }).click();
      await bubble.getByText('page 1', { exact: true }).waitFor();
      await shot(page, 'page-numbers-checked');
    },
    { vision: findsOn(0, (image) => [image + 6]) }
  );
});
