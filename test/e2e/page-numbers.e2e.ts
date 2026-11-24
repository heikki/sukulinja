// A Volume's page numbers (ADR-0032), shown where Settings asks for them:
// read by a page survey, counted between, corrected by hand, cleared and
// marked checked, those from its row's right-click menu in the Volumes
// tab.

import { afterAll, expect, test } from 'bun:test';

import type { Page } from 'playwright';

import { closeBrowser, shot, withApp } from './app';
import { newTree, openJuvaVolume, openList, turnAssistantOn } from './steps';
import { findsOn } from './vision';

afterAll(closeBrowser);

// Picks the step from the menu of the shown Volume's page numbers; where
// the menu was, for its question to be asked in the same place.
async function fromPagesMenu(page: Page, step: string, shotAs?: string) {
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
  const menu = page.locator('sl-context-menu');
  const at = await menu.boundingBox();
  if (shotAs !== undefined) await shot(page, shotAs);
  await page.getByRole('menuitem', { name: step }).click();
  return at;
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

      // Asked first, nothing under the question is pressed: a press outside
      // only takes it down.
      await fromPagesMenu(page, 'Clear page numbers');
      await page.getByRole('alertdialog').waitFor();
      const photos = await page
        .getByRole('tab', { name: 'Photos' })
        .boundingBox();
      await page.mouse.click(photos?.x ?? 0, photos?.y ?? 0);
      await page.getByRole('alertdialog').waitFor({ state: 'detached' });
      expect(
        await page
          .getByRole('tab', { name: 'Volumes' })
          .getAttribute('aria-selected')
      ).toBe('true');

      // Cleared, the Images are counted from the first again.
      const menuAt = await fromPagesMenu(
        page,
        'Clear page numbers',
        'page-numbers-menu'
      );
      await page
        .getByText('Takes away the page numbers read or set on 2 Images')
        .waitFor();
      const askAt = await page.getByRole('alertdialog').boundingBox();
      expect(askAt?.y).toBeCloseTo(menuAt?.y ?? -1, 0);
      await shot(page, 'page-numbers-clear-asked');
      await page
        .getByRole('alertdialog')
        .getByRole('button', { name: 'Clear', exact: true })
        .click();
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

// Sets the shown Image's page, or with '' none.
async function setPage(page: Page, typed: string) {
  const bubble = page.locator('sl-scan-page');
  await bubble.getByRole('button').first().click();
  await bubble.getByLabel('Page').fill(typed);
  await page.keyboard.press('Enter');
}

// Steps the Scan viewer from Image 1 to the Image, and on from there.
function stepper(page: Page) {
  let at = 1;
  return async (image: number) => {
    const step = image > at ? 'Next image' : 'Previous image';
    while (at !== image) {
      at += image > at ? 1 : -1;
      // eslint-disable-next-line no-await-in-loop -- one Image at a time
      await page.getByRole('button', { name: step }).click();
      // eslint-disable-next-line no-await-in-loop -- as above
      await page.getByRole('img', { name: `Image ${at}` }).waitFor();
    }
  };
}

test('two Images set to have no page number skip those between', async () => {
  await withApp(async ({ page }) => {
    await newTree(page);
    await page.getByRole('button', { name: 'Settings' }).click();
    await page
      .getByRole('group', { name: 'Page numbers' })
      .getByRole('button', { name: 'On' })
      .click();
    await page.keyboard.press('Escape');
    await openJuvaVolume(page, 'Pää- ja rippikirjat (1790-1796)');
    const bubble = page.locator('sl-scan-page');
    await page.getByRole('img', { name: 'Image 1' }).waitFor();
    const toImage = stepper(page);

    await toImage(2);
    await setPage(page, '');
    await bubble
      .getByRole('button', { name: 'skipped', exact: true })
      .waitFor();
    await toImage(6);
    await setPage(page, '');
    await bubble
      .getByRole('button', { name: 'skipped · images 2–6', exact: true })
      .waitFor();
    await shot(page, 'skipped-run-end');

    // Between its ends, an Image is counted skipped; after them, counted on.
    await toImage(4);
    await bubble
      .getByRole('button', { name: '≈ skipped · images 2–6' })
      .waitFor();
    await shot(page, 'skipped-run-between');
    await toImage(7);
    await bubble.getByRole('button', { name: '≈ page 2' }).waitFor();

    // A page set between splits the run, the Images beside it skipped.
    await toImage(4);
    await setPage(page, '2');
    await bubble.getByRole('button', { name: 'page 2' }).waitFor();
    await toImage(3);
    await bubble
      .getByRole('button', { name: 'skipped · images 2–3', exact: true })
      .waitFor();
    await toImage(5);
    await bubble
      .getByRole('button', { name: 'skipped · images 5–6', exact: true })
      .waitFor();
  });
});
