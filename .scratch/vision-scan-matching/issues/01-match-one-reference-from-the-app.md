Status: needs-triage

# Run the vision match for one reference from the app

Glossary: **Church-book reference**, **Match**, **Reader**, **Confirmation**, **Scan viewer**, **Rejection**.

Today the vision pass only runs as a script over a whole dataset (`scripts/match-citation-scans`), filtered at best by parish, Book or Volume. When a reference in the Scan viewer is only Estimated, and you'd rather not step through the Images yourself, you should be able to ask for a Match for that one reference from the app, then confirm it or Discard it as usual.

## Why it's more than a button

- **It reverses a design line.** `CONTEXT.md` says "Only scripts ask it; the app never calls a model", and `reader.ts` keeps the real Reader in `scripts/vision` for that reason. This changes the glossary and wants an ADR.
- **The SDK isn't shipped.** `@anthropic-ai/sdk` is a devDependency; the installed app bundle doesn't have it.
- **Credentials.** The script reads `ANTHROPIC_API_KEY` or an `ant auth login` profile. An app launched from Finder doesn't see shell env vars, so the key has to come from somewhere the app can read (the profile, a settings field, the Keychain).
- **The gate.** `runMatching` refuses to write until `scripts/evaluate-reader` has shown the entry model confirms at most 1% of decoys. The app run should honour the same gate and say why it won't run when the gate is closed.
- **Cost and time.** A match reads several Images (dates search, then Confirmation around the landing Image), so it takes seconds to minutes and costs money. The viewer needs a working state, a way to cancel, and the spend shown afterwards.

## Open questions (decide before agent work)

- **Where the model call runs.** In the app's Bun process (ship the SDK, move or share `claude-reader.ts`), or by spawning the existing script with a new `--reference <url>` filter. Spawning keeps the "app never calls a model" line mostly intact but needs `bun` and the repo on the machine, which the installed app can't assume.
- **What happens when it finds nothing.** Today an unconfirmed reference goes to `citation-scans-review.md`. In the app, likely just a message ("Not found on Images 40–46"), nothing saved.
- **Against a Rejection.** A reference with a Rejection on the Image the model lands on: show it as "the model still thinks it's here" or refuse, as the script does.
- **Against a hand pin.** Hand beats vision, so offering it on a Marked reference makes no sense; hide the action there.
- **Where it lives.** Following the viewer's right-click-menu convention: "Find with vision…" on the reference beside the scan, disabled with a reason when there are no credentials or the gate is closed.
- **Which references.** Rippikirja references only at first (matching trusted, 12/12 spot-checked), or Index references too (not yet trusted).

## Comments
