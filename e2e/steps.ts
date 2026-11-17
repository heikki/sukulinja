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

// The GEDCOM in e2e/fixtures imported as "Esimerkin suku", whose tree it
// then shows.
export async function importTree(page: Page, fixture: string) {
  await page
    .locator('#file-input')
    .setInputFiles(resolve(import.meta.dir, 'fixtures', fixture));
  await page.getByLabel('Name').fill('Esimerkin suku');
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await page.waitForURL(/\/d\/esimerkin-suku\/#\/person\/1$/);
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

// The corner's lists open on `tab`: Reminders, Changes, Church books,
// Photos, or the Assistant once it's on.
export async function openList(page: Page, tab: string) {
  await page.getByRole('button', { name: /^Reminders, Changes/ }).click();
  await page.getByRole('tab', { name: tab }).click();
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
