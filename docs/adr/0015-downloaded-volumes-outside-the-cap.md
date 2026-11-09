# Downloaded Volumes are kept outside the Scan cache's cap

Astia went down on 2026-10-21, and the app then worked only from what it had cached. We'd decided then that the Scan cache's cap and least-recently-viewed rule apply to every Image alike, with no separate "prepare for offline" step. Downloading a whole Volume is that step, asked for by hand in the Church books view, so its Images are kept apart: they don't count against the cap and are never dropped as least recently viewed. Removing the download hands them back to the cap, which may drop them at once; nothing else deletes them, Clear included.

Viewing still never keeps anything on its own. Which Volumes are kept is saved in the data folder's `settings.local.json` beside the cap, and every Scan cache on the folder reads it, so a script's cache keeps them too.

## Considered options

- **Inside the cap, as ordinary cache.** Rejected: a Volume is 100–500 MB, a few downloads would push out everything viewed, and later browsing could drop half a download unseen, which is the failure the download exists to prevent.
- **A cap of their own.** Rejected for now: one more setting to choose, when each download is already asked for one at a time and shown with its size.

## Consequences

- Settings shows the downloads' space apart from the cap's.
- Downloads go one Volume at a time and one Image at a time, a second apart, behind whatever the Scan viewer asks for. Quitting stops one; nothing resumes on its own at launch, so opening the app during an outage doesn't start asking a recovering Astia for hundreds of Images.
