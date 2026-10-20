Status: resolved

# Open an Unlinked reference in the Scan viewer

Spec: `../spec.md` (Change Volume…, Mark entry).

An Unlinked reference can't open the Scan viewer: its source has no Link, so clicking it does nothing, and Change Volume… is out of reach. For some references a person can still find the entry by looking elsewhere:

- **Not digitized**: Kangasniemi's 1737–1804 marriage register isn't scanned, but marriages were sometimes kept in a baptism Volume of the same years (I C:2, 1737–1792). 18 references in the tree.
- **No Volume fits**: a Mikkeli baptism of 10 January 1779 falls in the gap between I C:4 (1760–1778) and I C:5 (1782–1788). Here the pages turn out to be lost (I C:5's title page says it covered 1779–1788 and was damaged in 1789), but only looking shows that. 3 references.

Opening the viewer empty, with Change Volume… available, lets a person look and Mark the entry where they find it. Nothing changes until they save a Box.

```
┌──────────────────────────────────────────────┐
│                                              │
│        No Volume fits this reference         │
│   Astia has no baptisms for 1779 in Mikkeli. │
│                                              │
│              [ Change Volume… ]              │
│                                              │
└──────────────────────────────────────────────┘
```

## Proposed (confirm before agent work)

- **Which references**: Unlinked for `no-volume`, `not-digitized` or `no-images`, where the parish's archive and the Book are known. Not `unparsed`, `no-archive` or `astia-error`: there's nothing to list.
- **Empty viewer**: no Image, the Unlinked reason as the message, and Change Volume… as a button as well as in the context menu, since there's no scan to right-click. The nav shows no page controls until a Volume is picked.
- **Change Volume… list**: _Fits the reference_ is empty, so _Other Volumes_ come first, nearest the reference's years first. Volumes that aren't digitized are listed but greyed out, so the list explains itself.
- **Saving**: unchanged. Mark entry in the picked Volume saves a Reference pin (index references have no page), and the source becomes Marked. If nothing is found, closing the viewer leaves it Unlinked. No "not known" pin (`06-not-known.md` stays wontfix).
- **Serving**: the client needs to know a resolution is openable. Either `LinkResolution`'s unlinked case carries `openable: true` (with the reason kept for the label), or the viewer opens any church-book source and asks `GET /api/citations/:id/volumes` for the list, which already works without a Link.

## Comments

Built (2026-10-20). As proposed, with these choices:

- Openable when the resolution names the parish's archive, which the server sets for `no-volume`, `not-digitized` and `no-images`.
- The button reads **Choose a Volume…**; a right-click on the empty stage opens the same list. Volumes not digitized aren't listed (the list is the existing one, digitized Volumes of the reference's Book, by years).
- Such sources also move under their parish's archive heading in the person panel, after the linked ones.
- Not done: arrow keys still step only through linked sources.
