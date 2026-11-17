Status: accepted (2026-11-17)

# E2E tests drive the browser app against a fixture Astia

The tests so far are `bun test` unit and integration tests: the server's operations on a real SQLite database, client state, GEDCOM fixtures and tree snapshots. The UI was checked by hand, with `bun dev` and screenshots. Heikki (2026-11-17) wants end-to-end tests, run in Claude's cloud sessions as well as on his Mac, starting from building a tree from scratch. Astia can't be reached from the cloud, and the tests must not depend on it anyway.

- **Playwright's Chromium drives the page `bun dev` serves**, from `bun test`: one test runner, no second config. The tests are `e2e/*.e2e.ts`, outside `bun test`'s own patterns, and run with `bun run e2e`. Playwright is pinned to the version the cloud image ships with its browser, so a cloud session downloads nothing.
- **One server for both.** `serveInBrowser` (`src/server/browser.ts`) is the page and API as a browser tab gets them; `bun dev` calls it with the checkout's data folder, a test with a fixture setup. A test serves it in its own process, beside the browser it drives.
- **Each test starts empty**: a data folder of its own in the temp directory, removed after. No demo seed, no real data; names, places and the church book page are invented.
- **Nothing reaches outside the machine.** `createApi`'s seams take the fakes: Astia is the unit tests' Juva archive (`juvaAstia`), under numeric Volume ids as the routes want, every Image a picture of an invented church book page (`e2e/fixtures/`); the assistant's key store is empty; exports go to the data folder. Vision and the assistant come in later through the same seams with stub models.
- **Elements are found as a person finds them**: by role, label and text, which Playwright reads through the Lit components' shadow roots. An element a test can't name that way gets an accessible name in the app, not a test id.
- **Screenshots come from the same run.** `SUKULINJA_E2E_SHOTS=<dir>` saves the shots a test takes, so a cloud thread shows a UI change from a test instead of by hand.
- **Not in `verify` yet.** CI runs `bun run e2e` after the unit tests; the pre-push hook stays at its ~30 s. It can join `verify` once the suite has shown it stays fast.

## Considered options

- **`@playwright/test` as its own runner.** Rejected: a second runner and config for a handful of flows, and it runs under Node, not Bun, which `bun dev`'s HTML bundling needs.
- **Recorded Astia answers (HTTP fixtures).** Rejected: the `Astia` interface is already the seam the unit tests use, and recordings of real archives would bring real people's pages into a public repo.
- **Driving the Electrobun app.** Rejected for now: it runs only on macOS, and the browser page is the same UI. Native menus, file dialogs and the window stay checked by hand.

## Consequences

- `dev.ts` shrinks to choosing its data folder; `ApiOptions` is exported.
- `memoryAstia` takes the bytes its Images hold, and `juvaAstia` passes options through.
- CI installs Chromium before the e2e step. A cloud image with another Playwright version needs the pin moved to match.
