// Steps more than one e2e test takes, as a person takes them.

import { resolve } from 'node:path';

import type { Page } from 'playwright';

// A new dataset, "Esimerkin suku", started from Matti Esimerkki, whose
// tree it then shows.
export async function newTree(page: Page) {
  await page.getByRole('button', { name: 'New dataset…' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Esimerkin suku');
  await page.getByLabel('Given names').fill('Matti');
  await page.getByLabel('Surname').fill('Esimerkki');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.waitForURL(/\/d\/esimerkin-suku\/#\/person\/1$/);
}

// The GEDCOM or GEDZIP in test/e2e/fixtures, or at an absolute path, imported
// from the dataset list as `name`, whose tree it then shows.
export async function importTree(
  page: Page,
  file: string,
  name = 'Esimerkin suku'
) {
  await page
    .locator('#file-input')
    .setInputFiles(resolve(import.meta.dir, 'fixtures', file));
  await page.getByLabel('Name').fill(name);
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await page.waitForURL(/\/d\/[^/]+\/#\/person\/\d+$/);
}

// The Assistant, and Vision Match with it, turned on in Settings.
export async function turnAssistantOn(page: Page) {
  await page.getByRole('button', { name: 'Settings' }).click();
  await page
    .getByRole('group', { name: 'Assistant' })
    .getByRole('button', { name: 'On' })
    .click();
  await page.keyboard.press('Escape');
}

// The corner's lists on `tab`, opened first if they're closed: Reminders,
// Changes, Church books, Photos, or the Assistant once it's on.
export async function openList(page: Page, tab: string) {
  const tabs = page.getByRole('tab', { name: tab });
  if (!(await tabs.isVisible())) {
    await page.getByRole('button', { name: /^Reminders, Changes/ }).click();
  }
  await tabs.click();
}

// The Volume of Juva's archive in the Scan viewer, from the Church books.
export async function openJuvaVolume(page: Page, volume: string) {
  await openList(page, 'Church books');
  await page.getByRole('button', { name: 'Juvan seurakunnan arkisto' }).click();
  await page.locator('sl-church-books-list').getByText(volume).click();
  await page.keyboard.press('Escape');
}

// The person panel's section open, whether or not it was before.
export async function openSection(page: Page, name: string) {
  const closed = page.getByRole('button', { name, expanded: false });
  if ((await closed.count()) > 0) await closed.click();
}

// The person's box in the tree, by a name it shows.
export function boxOf(page: Page, name: string) {
  return page.locator('[data-box-key]').filter({ hasText: name });
}

// From the menu on the person's box, `item` taken: "Add father…",
// "Delete person…" and the like.
export async function fromBox(page: Page, name: string, item: string) {
  await boxOf(page, name).click({ button: 'right' });
  await page.getByRole('menuitem', { name: item, exact: true }).click();
}

// A new person added from the menu on someone's box: "Add father…" and
// the like, then their name.
export async function addRelative(
  page: Page,
  of: string,
  item: string,
  [given, surname]: [string, string]
) {
  await fromBox(page, of, item);
  await page.getByLabel('Given names').fill(given);
  await page.getByLabel('Surname').fill(surname);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await boxOf(page, given).waitFor();
}

// Where a line of the fixture's church book page is, as fractions of the
// Image: its first four lines, and the column of names.
export const PAGE_LINES = [0.171, 0.238, 0.305, 0.372];
const NAME_COLUMN = 0.27;

// A right-click on the line of the Image shown, as a person makes it: on
// the picture, or a Box over it.
export async function rightClickLine(page: Page, image: number, line: number) {
  const at = await page
    .getByRole('img', { name: `Image ${image}` })
    .boundingBox();
  if (at === null) throw new Error(`Image ${image} isn't shown`);
  await page.mouse.click(
    at.x + at.width * NAME_COLUMN,
    at.y + at.height * PAGE_LINES[line - 1]!,
    { button: 'right' }
  );
}
