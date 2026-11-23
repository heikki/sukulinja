# An estimate starts from the reference alone

The app shipped Page pins, Record ranges and village lists for 160 Volumes in `pins.json`, all gathered from Heikki's own parishes. With the MyHeritage import kept for others (ADR-0030), Heikki decided (2026-11-15) that nothing pre-generated ships: a reference's book, years and page, and Astia's list of Volumes, are what an estimate starts from.

- **`pins.json` is gone**, with the layer the data folder's pins were read over. A new data folder has no pins; Page pins and Record ranges come only from what the person Marks or the vision model reads in the app (ADR-0013's local file, shared by the folder's datasets). An estimate still learns from those.
- **Without a Page pin a page is counted from the Volume's first Image**: one number a spread for a rippikirja, two for a lastenkirja, and two for a rippikirja too where the cited page wouldn't fit the Volume by spread. A cited page past the end still links only the Volume.
- **Page runs** (2026-11-15): a Volume may number its pages over again (parts of one book, Heikki says, though rare), so Page pins are read in Image order as runs, a new one where the numbers go back. A page is counted in each run its pins reach; the Record pins around the record (MyHeritage numbers a film's records in Image order) pick among them, else the first run (2026-11-23: a Doubled volume's first copy, as Heikki asked, not the run with the most pins). A lone pin going back where the next carries on the run is an aside, a misread page pinned as cited. Two pins of one page replace each other only within ten Images.
- The village a Volume holds is read from its label in Astia ("Haapakoski - Längelmäki"); there's no list of villages per Volume beyond what's already saved.

## Consequences

- An unpinned Volume's estimates are often several Images off, so Vision Match has to read page numbers to find its way. Planned next: a page survey of a Volume, and locating a whole Volume's references at once.
- `scripts/check-rescans` checks only the data folder's pins, and a stale pin no longer says where it was kept.
