Status: needs-triage (design proposed 2026-11-09, waiting on Heikki)

# Download whole Volumes for use without Astia

From [issues/01-download-whole-volumes.md](issues/01-download-whole-volumes.md). Glossary: **Volume**, **Image**, **Scan cache**, **Scan viewer**, **Re-scan**.

## In one line

From the Scan viewer's right-click menu, **Download Volume** fetches every Image of the Volume shown, full size and thumbnail, into the Scan cache and keeps them there until removed; Settings lists the downloaded Volumes.

## New term

**Downloaded Volume**:
A Volume asked to be kept whole in the Scan cache, so stepping through it works without Astia. Its Images don't count against the cap and aren't dropped as least recently viewed; removing the download hands them back to the cap's rules (nothing is deleted then). Kept for the install, like the cap, not per dataset.
_Avoid_: offline volume, pinned volume (a Pin is something else).

This changes the 2026-10-21 decision "the cap and least-recently-viewed rule apply to every Image alike": they still apply to every Image not in a Downloaded Volume. Viewing alone still never keeps anything; only asking for a download does. Worth an ADR (0015) when it lands.

## Answers to the ticket's open questions

### Size against the cap

- **Outside the cap.** A Volume is 100–500 MB; inside a 5 GB cap, a few downloads would push out everything viewed, and a download could be half evicted by later browsing, which is the failure the feature exists to prevent.
- Settings shows the two apart: "Scan cache: 1.2 GB of 5 GB · Downloaded: 450 MB in 1 Volume". **Clear** clears the cache only, not downloads (its dialog says so).
- Before starting, the menu item's confirm says the Volume's size as Astia lists it (count × ~2.5 MB, an estimate until done): "Download I Ab:5 (180 Images, about 450 MB)?"
- Removing a download (Settings, or the menu on that Volume) turns its Images back into ordinary cache: they're pruned to the cap at once, least recently viewed first.

### Pace, stopping and resuming

- **One download at a time**, a queue of Volumes behind it. Each Image goes through the Scan cache's existing one-at-a-time full-size lane, one at a time, so a viewer request queued meanwhile goes first (the lane takes latest first and a download only ever has one Image waiting).
- **A gap of 1 s between Images** fetched from Astia, the same as `REQUEST_GAP_MS` for answers; Images already cached are skipped without a gap (as `isCached` lets the vision pass do). I Ab:5's 180 Images then take roughly 5–10 minutes.
- **Throttling**: a 429 already backs off 30 s in `astia.ts`. Uses the crawl's patience (rides out a blip, unattended), not the viewer's.
- **Astia failing** (502, refused, notice page) after its retries stops the download, which is listed as **Stopped: Astia couldn't be reached**, with Resume.
- **Stop / Resume**: Stop leaves what's fetched and keeps it a Downloaded Volume, listed as incomplete ("120 of 180"). Resume carries on from the first Image not on disk. Quitting the app is a Stop; nothing resumes on its own at launch (opening the app offline shouldn't start hammering a recovering Astia).
- **Re-scan**: the download uses the app's cache (`switches: false`), so an Image gone with a re-scan stops it as **Re-scanned in Astia**; switching to the new filming in the Scan viewer, as today, drops the old Images and the download shows incomplete again, to Resume onto the new filming.

### Where it's asked for

- **Scan viewer, right-click menu**, after Change Volume…: **Download Volume…** for the Volume shown; on one being or already downloaded, **Stop download** / **Resume download** / **Remove download**. Only when a Volume is shown and Astia has listed its Images.
- **Scan viewer toolbar**: beside the Volume's title, "Downloading 42/180" while that Volume downloads, "Downloaded" once whole.
- **Settings**, under Scan cache: a list of Downloaded Volumes (title, Images on disk of total, size, state) with Stop/Resume and Remove. Settings is where the space is managed, and where one is removed without opening it.

## Groundwork first (refactor, its own commit)

The Scan cache owns `settings.local.json` today: `readSettings`/`savedCap` and `setCap`'s read-modify-write live inside `scan-cache.ts`. Downloads would be a second writer of the same file, and two read-modify-writes can lose each other's change. So before the feature:

- **`install-settings.ts`**: the install's settings file, read once and written through one serialized writer, typed per key. The Scan cache reads and saves its cap through it, unchanged in behaviour.
- **The Scan cache takes what it must keep**: `openScanCache({ …, kept })`, where `kept(volumeId)` says a Volume's folder is outside the cap. `prune` and `used` honour it; the cache knows nothing about downloads beyond that.

Then downloads are a module of their own on top of the cache's public `image()`, not code inside it.

## Server

- Downloaded Volumes are kept, through `install-settings.ts`, in `settings.local.json` as `downloadedVolumes: [{ volumeId, label }]`, beside `scanCacheBytes`.
- `prune` skips files where `kept(volumeId)`, and they're left out of `used`; `status()` adds `downloaded: { bytes, volumes }`.
- A new module `astia/downloads.ts`: the queue of Volumes, the one running, its progress, Stop. Reads the Volume's list via `astia.volumeImages`, fetches each Image through `cache.image(…, 'full' | 'thumb', signal)`, aborting the signal on Stop.
- Routes, outside any dataset beside the others in `astia-routes.ts`:
  - `GET /astia/downloads`: every Downloaded Volume and its state (`queued | downloading | stopped | complete`, `cached`, `images`, `bytes`, `error?`).
  - `PUT /astia/volumes/:id/download`: download or resume (idempotent).
  - `POST /astia/volumes/:id/download/stop`: stop, keep.
  - `DELETE /astia/volumes/:id/download`: stop and remove.
- Progress reaches the client by polling `GET /astia/downloads` every 2 s while anything is queued or downloading, only while the Scan viewer or Settings is open. (Import progress streams; a poll is simpler here and nothing else needs a stream.)

## Tests

With `memory-astia.ts` and a temp data folder:

- A download fetches every full Image and thumbnail, skips those cached, and ends `complete`.
- A Downloaded Volume's Images survive pruning to a cap smaller than they are, and don't count in `used`; removing the download prunes them.
- A viewer request made mid-download is served before the download's next Image.
- Stop mid-way leaves `stopped` with what's fetched; Resume fetches only the rest.
- Astia failing stops it with the error; a re-scan stops it as re-scanned, and after `refresh` it's incomplete again.
- The setting survives reopening the cache; Clear leaves downloads alone.
- Client: the menu items for each state (`menu.test.ts`).

## Not in this

- Downloading a whole parish or Book at once (the Settings list could later take "Download every Volume of this Book").
- Resolving references never resolved before: that needs Astia's archive answers, which `.astia-cache` already keeps for good once fetched.
