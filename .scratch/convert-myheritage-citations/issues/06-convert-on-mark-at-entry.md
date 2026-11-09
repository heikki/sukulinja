Status: ready-for-agent
Blocked by: 01, 02, 03, 04, 05

# Convert a reference when it's Marked at the entry

Spec: `.scratch/convert-myheritage-citations/spec.md`. Glossary: **Conversion**, **Mark**, **Match**, **Box**, **Church-book reference**, **Citation** (`src/server/citations/GLOSSARY.md`). ADR-0016.

- **A Conversion module in `src/server/citations/`**, outside `myheritage/`: given citation ids and each one's plain text, it makes them app-made Citations of their Image, through `app-citations.ts`: the Volume's source, the plain text, `added_in_app = 1`, page and link as the Mark left them, original page kept. One transaction with the Mark.
- **The port supplies what's MyHeritage's**: which citations a Mark at the entry wrote to (every citation of the record, or of the URL), and each one's transcription as plain lines (name, the shown fields, then the household rows), from `readRecord`.
- **When:** a hand Mark with a Box, or confirming a Match. Not a Mark at the Image or the Volume only, and not an unchecked Match.
- **Never a reference:** the port says no for an app-made Citation, whatever its original page.
- **No deleting a converted one:** `uncite` refuses an app-made Citation with an original page. `CitationRow` gets a `deletable` flag, which the Scan viewer's menu and edit bar (`scan-viewer/menu.ts`, `edit.ts`, `state/viewer.ts`) use in place of `madeInApp`. Moving its Box within its Volume works as for any Citation of an Image.
- The GLOSSARY's **Mark** entry says a Mark at the entry converts.

## Tests

- A hand Mark at the entry converts every citation of the record: Volume's source, plain text, app-made, original page kept, no longer listed as a reference, its Link Marked at the entry.
- Confirming a Match converts; a Mark at the Image only doesn't.
- A converted Citation can't be deleted, and its Box moves.
- The GEDZIP round trip gives the same converted Citation back.

## Comments
