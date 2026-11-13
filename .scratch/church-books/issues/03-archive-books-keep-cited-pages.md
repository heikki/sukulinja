Status: needs-triage

# Archive downloaded books elsewhere, keep only cited pages

Glossary: **Scan cache**, **Volume**, **Image**, **Citation**.

Heikki, 2026-11-09: archive a cached book, e.g. to an external SSD, maybe keeping only the cited pages downloaded.

Two ideas:

- **Archive a Volume** out of the Scan cache to a folder of one's choosing (an external SSD), so a whole book is kept without taking the cache's space, and read back from there when the drive is attached.
- **Keep the cited Images**: the Images the dataset's Citations link to stay on disk however the cache's cap prunes, so a person's sources open without Astia even if the rest of the book is dropped.

## Open questions

- Archive format: the cache's own folder layout (`<volumeId>/<fileId>.jpg`) copied as is, or something readable outside the app.
- Whether the Scan cache reads an archive folder as a second place to look, and what happens when the drive isn't attached.
- For cited Images: the Link's Image only, or also its neighbours (Retakes, the next spread); and whether they count against the cap (ADR-0015 says downloads do).
