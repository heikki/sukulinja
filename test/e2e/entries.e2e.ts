// Entries made, edited and deleted in the Scan viewer (ADR-0026, ADR-0033):
// a baptism whose date is corrected, the change offered to the tree but
// taken only when ticked, and a Fact it supported let go when unticked; a marriage naming the couple; and a deletion.

import { afterAll, test } from 'bun:test';

import { closeBrowser, shot, withApp } from './app';
import {
  addRelative,
  boxOf,
  newTree,
  openJuvaVolume,
  openSection,
  rightClickLine
} from './steps';

afterAll(closeBrowser);

test('a baptism is corrected and a marriage made and deleted', async () => {
  await withApp(async ({ page }) => {
    await newTree(page);
    await addRelative(page, 'Matti', 'Add spouse…', ['Liisa', 'Keksitty']);
    await boxOf(page, 'Matti').click();
    await openJuvaVolume(page, 'Syntyneiden ja kastettujen luettelot');

    // His baptism, on the first line of the first page.
    await rightClickLine(page, 1, 1);
    await page.getByRole('menuitem', { name: 'New entry' }).click();
    await page.getByLabel('Born').fill('3.3.1795');
    await page.getByLabel('Baptised').fill('5.3.1795');
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    // The book says the 6th: the Christening's change is offered, unticked.
    const entry = page.locator('[data-own]');
    await entry.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();
    await page.getByLabel('Baptised').fill('6.3.1795');
    const change = page.getByLabel('Change Christening 5.3.1795 → 6.3.1795');
    await change.waitFor();
    if (await change.isChecked()) throw new Error('a change starts unticked');
    await change.check();
    // The Birth it supports is kept as its source unless unticked.
    const keep = page.getByLabel('Birth 3.3.1795: keep as its source');
    if (!(await keep.isChecked())) throw new Error('a source starts kept');
    await keep.uncheck();
    await shot(page, 'entries-edit');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await change.waitFor({ state: 'detached' });

    // Unticked, it no longer is: offered again as a match.
    await entry.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();
    await page
      .getByLabel('Birth 3.3.1795 matches: use as its source')
      .waitFor();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();

    // The couple's marriage on the next page. Matti, a man, starts as its
    // groom; his wife is chosen as the bride.
    await page.getByRole('button', { name: 'Next image' }).click();
    await rightClickLine(page, 2, 3);
    await page.getByRole('menuitem', { name: 'New entry' }).click();
    await page.getByLabel('Kind of entry').selectOption({ label: 'Marriage' });
    await page.getByRole('button', { name: 'Choose…' }).click();
    await page.getByRole('menuitem', { name: /Liisa Keksitty$/ }).click();
    await page.getByLabel('Married').fill('1.6.1820');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const people = page.locator('sl-scan-people');
    await people.getByText('Liisa Keksitty').waitFor();
    await shot(page, 'entries-marriage');

    // Deleted, it no longer names Liisa.
    await entry.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Delete entry' }).click();
    // It names others too, so the viewer asks first.
    await page
      .getByText('The entry and all 2 citations of it are deleted.')
      .waitFor();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await people.getByText('Liisa Keksitty').waitFor({ state: 'detached' });

    // The tree took the corrected Christening.
    await page.keyboard.press('Escape');
    await openSection(page, 'Facts');
    const events = page.locator('sl-person-panel');
    await events
      .getByRole('button', { name: /^Christening 6\.3\.1795/ })
      .waitFor();
  });
});
