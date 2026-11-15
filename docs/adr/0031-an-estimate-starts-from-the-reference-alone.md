# An estimate starts from the reference alone

The app shipped Page pins, Record ranges and village lists for 160 Volumes in `pins.json`, all gathered from Heikki's own parishes. With the MyHeritage import kept for others (ADR-0030), Heikki decided (2026-11-15) that nothing pre-generated ships: a reference's book, years and page, and Astia's list of Volumes, are what an estimate starts from.

- **`pins.json` is gone**, with the layer the data folder's pins were read over. A new data folder has no pins; Page pins and Record ranges come only from what the person Marks or the vision model reads in the app (ADR-0013's local file, shared by the folder's datasets). An estimate still learns from those.
- **Without a Page pin a page is counted from the Volume's first Image**: one number a spread for a rippikirja, two for a lastenkirja, and two for a rippikirja too where the cited page wouldn't fit the Volume by spread. A cited page past the end still links only the Volume.
- The village a Volume holds is read from its label in Astia ("Haapakoski - Längelmäki"); there's no list of villages per Volume beyond what's already saved.

## Consequences

- An unpinned Volume's estimates are often several Images off, so Vision Match has to read page numbers to find its way. Planned next: Page pins in runs (a Volume may number its pages over again), a page survey of a Volume, and locating a whole Volume's references at once.
- `scripts/check-rescans` checks only the data folder's pins, and a stale pin no longer says where it was kept.
