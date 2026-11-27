# A dataset lists its Volumes; the install keeps what's known of them

The Church books view listed a dataset's archives, and an archive's Volumes in Astia's order, one long list each, with no series, no years to narrow by, and nothing of the Selected person. Another Volume was looked for in three places that each worked their own way. Heikki (2026-11-19) asked for the tab to become a list of the books in use at a glance, with books added to it from a picker and taken off, and for all that books share, downloads and later offloading, to be managed from it.

- **The tab is the Book list, named Volumes.** Every Volume the dataset's Citations link into is on it, and those added by hand, as a table by archive, each one's Volumes by series and years. It's named Volumes, not Church books, as Astia holds other sources than church books and the app will cite them too (Heikki chose the name).
- **Only which Volumes are listed is the dataset's.** Added Volumes are a table of the dataset's own, `listed_books` (schema 14), with the archive holding each; cited ones are read from the Citations, so the list never goes out of step with them. What of a Volume is on disk, its download and its Page pins stay the install's (ADR-0015), so a Volume is downloaded and its pages read once for every dataset. Taking a Volume off the list leaves its Images on disk.
- **A cited Volume stays.** Only one added by hand that no Citation links into is taken off.
- **Adding is no Change.** The list says what the dataset works in, not what the tree says; like a Reminder, it writes none and no export carries it.
- **One picker finds Volumes,** a modal over the window: the parishes, the Volumes fitting the Selected person's Expected entries, and a parish's Volumes by series, narrowed by a series or a year. It adds to the list or opens a Volume.

## Considered options

- **The list kept per install.** Rejected: how many Citations link into a Volume is a dataset's, and trees work in different parishes.
- **Downloads and page numbers per dataset.** Rejected by Heikki: the same Volume would be downloaded and read twice for nothing.
- **Cited Volumes stored in the table too.** Rejected: a Citation made or deleted would have to keep it up to date.

## Consequences

- A view of every Volume with anything on this computer, shared by every dataset (downloads, page numbers checked, and later offloading), is the tab's second mode, _All trees_. It shows every dataset's Book list too, and counts every dataset's Citations: a Volume another tree cites vanished from it once its Images were removed (Heikki, 2026-11-27). Taking a Volume off the list there still takes it off only this dataset's.
- The Scan viewer's _Change Volume…_ opens the same picker.
