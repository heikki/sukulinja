Status: in progress — tickets 01–04 built (ADR-0035); 05 open

# Volumes: the Book list and the Volume picker

Glossary: **Volumes** (the view), **Book list**, **Volume picker**, **Expected entry**, **Volume**, **Parish**, **Scan cache**, **Page pin** (`src/server/citations/GLOSSARY.md`). Decision: ADR-0035. Builds on ADR-0015 (downloads share the cap), ADR-0027 (operations). Draft UI: the "Kirjalista ja kirjavalitsin" design canvas in the project.

Heikki, 2026-11-19: the app should offer first the books that fit the Selected person; then, the whole book picker redone, as it was clumsy: Church books opened from three places that each worked their own way, an archive's Volumes one long list in Astia's order, no series or years to narrow by.

## Decisions (Heikki, 2026-11-19)

- The corner panel's tab is the **Book list**, as a table: every Volume the dataset's Citations link into, and those added by hand. Named **Volumes**, as other sources than church books are coming.
- The list is the dataset's; downloads, page numbers and later offloading are the install's, done once for every tree.
- Two modes: _This tree_ (the list) and _All books_ (every Volume with anything on this computer, to manage downloads, offloading and page numbers for all trees).
- A cited Volume stays on the list; one added by hand and cited by nothing can be taken off. Its Images stay on disk.
- The Volume picker is a modal: parishes down the side, _Fits <Selected person>_ on top, then a parish's Volumes by series, narrowed by series or year.
- Page numbers can be marked checked for a Volume; checked, they're locked in the Scan viewer until unmarked, and Vision Match warns before running on one unchecked. Kept simple: one mark, nothing more until tried.
- Expected entries from a person's own Facts and sources. Parents' and spouse's places as a weaker reason where their own is missing: agreed, not built yet.

## Tickets

- `01` Expected entries and `personBooks` — done.
- `02` The Book list, the Volumes tab and the Volume picker — done.
- `03` The _All books_ mode.
- `04` Page numbers checked.
- `05` The Scan viewer changes Volume through the picker.
