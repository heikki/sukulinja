# Downloaded church books share the Scan cache's cap

Downloading a Volume in the Church books view fetches all its Images into the Scan cache as ordinary cache: they count against the cap the install sets and go least recently viewed first, like any Image viewed. This keeps the 2026-10-21 decision that the cap and that rule apply to every Image alike. A download is a way to fill the cache ahead of an outage, not a second store.

## Considered options

- **Kept outside the cap until removed** (built first, then dropped on 2026-11-09). Rejected as a second concept to explain and manage (Keep, Remove, a second size in Settings, a list of kept Volumes in the settings file) for a risk that's small with a 5 GB cap and Volumes of a few hundred MB.
- **Counting against the cap but never evicted.** Rejected: once downloads alone fill the cap, either downloading stops or everything else viewed goes, so it adds rules rather than removing them.

## Consequences

- A downloaded Volume can be evicted by enough later browsing; the view shows what of each is on disk, and downloading again fetches only what's missing.
- Nothing about a download is saved: quitting stops it, and nothing resumes at launch.
