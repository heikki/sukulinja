# E2E tests

Playwright's Chromium drives the app as `bun dev` serves it, against a fixture
Astia, from `bun test`. Why it's built this way: ADR-0034.

## Running

```bash
bunx playwright install chromium   # one-time
bun run e2e                        # every test, headless
bun run e2e:headed                 # every test in a window you can watch
```

One file:

```bash
bun test --timeout 30000 ./e2e/photos.e2e.ts
SUKULINJA_E2E_HEADED=1 bun test --timeout 60000 ./e2e/photos.e2e.ts
```

`bun run e2e <file>` still runs them all: the script names every test already.

Screenshots: `SUKULINJA_E2E_SHOTS=<dir> bun run e2e` saves the shots tests take
with `shot(page, name)`. In a cloud session, use a folder under
`/mnt/project-files/`, never the repo.

Headed in a cloud session, which has no display: `xvfb-run -a bun run e2e:headed`.

## Writing a test

- A test is `e2e/<path>.e2e.ts`, one path a person takes through the app.
  `withApp(async ({ page }) => …)` gives it an app of its own on an empty data
  folder; `afterAll(closeBrowser)` closes the shared browser.
- Take steps from `steps.ts` (`newTree`, `importTree`, `openList`,
  `openJuvaVolume`, `addRelative`, `rightClickLine`, …), and put a step two
  tests take there.
- Find elements as a person does: by role, label and text. An element a test
  can't name that way gets an accessible name in the app, not a test id.
- Data is invented, as in `fixtures/`: the repo is public.
- Astia is `astia.ts`: Juva's archive (Volumes 1000001–3, every Image
  `fixtures/church-book-page.jpg`) and an invented parish to find. Claude
  answers from the test's script (`withApp(fn, { assistant: […] })`), and
  Vision Match from `vision.ts` (`{ vision: findsOn(image, pagesOf) }`); with
  neither, the models refuse.
- Wait for what a step opens before acting on it. A Mac can be faster than
  a cloud session, so a right-click right after opening a photo can land on
  the one shown before.
- Playwright waits 5 s for a step: nothing here is slow, so a longer wait is a
  failure.
