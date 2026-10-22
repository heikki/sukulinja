# Create a Citation while browsing a scan

Glossary: **Citation**, **Church-book reference**, **Mark**, **Box**, **Scan viewer**.

While stepping through a Volume in the Scan viewer you find entries for people in the tree that nothing cites yet: a sibling's baptism, a household in the next rippikirja. Today all Citations come from the MyHeritage import, so you can't record what you found.

## Why it's more than a Mark

A Mark only links where an existing Citation points. A new Citation is new genealogical data, which the app has never written. It needs somewhere to live that survives a re-import and can be exported: since ADR-0013, the dataset's database holds the whole tree (2dfda4d) and a GEDZIP carries it out and back (1d27ee5).

## Decided 2026-10-22

- **Who it's for:** right-click on the scan → _Cite this entry for_, which lists the Selected person and their parents, siblings, spouses and children, then _Someone else…_ with the person search (`sl-person-search`, today in the tree view). A sibling's baptism doesn't need the sibling selected first; the viewer only opens from the Selected person's own sources. Anyone whose Citation already links the Image shown is left out, of the family and of the search: they're the people listed beside the scan, Marked, Vision match or Estimated, and an Estimated one wants marking, not a second Citation.
- **What it hangs on:** the person, like every imported Citation today (3,799, none on a fact). The fact it supports can come later.
- **Its source:** one source record per Volume: the book itself, titled with the Volume's label, published by Kansallisarkisto in Astia. The Citation's `page` is the Image's address in Astia, and its Annotation holds the link and Box, as a hand Mark's does.
- **Always a Box.** _Cite this entry for_ places a pending Box where the menu was opened, to adjust, then Cancel / Save at the end of the nav, the same flow as _Mark entry_. The Box is what says which entry it is.
- **Optional short text**, a one-line field while the Box is pending (e.g. "Baptism 12.3.1795"), stored as the Citation's DATA TEXT. Left empty, the panel names it by its Volume and Image.
- **Discard deletes it.** On a Citation made in the app, the Box menu says _Delete citation_ instead of _Discard mark_, and asks to confirm. This answers what a Discard does to a Citation with no original page.
- **The person panel** lists it among the person's imported sources, under its archive, and opens the viewer at its Box like a Mark. No _Added in Sukulinja_ label (changed 2026-10-22).

### Follows from these

- **The merge must carry the app's sources.** A Citation made in the app is reattached only when its source is in the new export; a re-import from MyHeritage without an upload in between wouldn't have the per-Volume source, and would list the Citation as lost. A source made in the app needs marking as such, and carrying like the Citations.
- **Its Link is read from its Annotation**, not from its page. A Mark's key and the Link resolution read a Church-book reference from the original page (a MyHeritage URL); a Citation made in the app has none, so the person panel and the Scan viewer's people beside the scan must show its stored link directly.
- **The Scan viewer's people beside the scan** list it with the Marked rows of its Image.

## Tickets

- 01, the server, the source per Volume, and the merge: built in 720ce9e.
- 02, making and deleting one in the Scan viewer: built in 122391b.
- 03, the person panel: built in 1f4e93a.

## Comments

**Storage decided 2026-10-21** in `docs/adr/0013-database-holds-the-tree-gedzip-carries-it.md`: an app-made Citation is a row in the dataset's database like an imported one, with its Astia link written into it the same way a Mark is. A re-import of the MyHeritage export reattaches it to the same person by `UID` (or record id), and drops it if the new export has the same Citation. The first open question is answered; the rest still stand.

**Merge built 2026-10-21** (f8965b7): a citation made in the app is a `citations` row with `added_in_app = 1`. A re-import reattaches it to its person, or to the same fact of theirs, and the GEDZIP carries it as `NOTE Added in Sukulinja`.

**Open from the Annotation refactor (4018d81):** Discarding the Box of a Citation made in the app. It has no original page to go back to and no MyHeritage reference to estimate from, so today's rule would leave it citing the Astia address with no Link. Decide what a Discard does to one: keep the Mark at the Image without its Box, drop the Citation, or refuse.

**Server built 2026-10-22** (720ce9e): making and deleting a Citation on an Astia Image, its Volume's source (found by the Citations made in the app in the Volume, so no source is marked as the app's), reading it back, and the merge carrying that source (ADR-0013). Left open: after a Re-scan of its Volume, a Citation made in the app still shows on its old file id, where a Mark is left out.

**Person panel built 2026-10-22** (1f4e93a): a Citation of an Astia Image is read by its stored Link, not by its being made in the app, so MyHeritage Citations converted to that form later read the same way. It's named by its text, or by its Volume, with its Image as its entry. `PAGE` stays a URL; the spec's `Label: value` form is deferred in ADR-0013. Left open: within a Volume the panel sorts by cited page, so a Citation of an Image comes first; sorting by Image instead was suggested.

**Scan viewer built 2026-10-22** (122391b): _Cite this entry for…_ lists the Selected person, then their family in the person panel's household order (each spouse with that marriage's children), then _Someone else…_. _Edit mark_ on a Citation made in the app moves it within its Volume, through the Mark route. _Delete citation_ closes the viewer, as the source it showed is gone.
