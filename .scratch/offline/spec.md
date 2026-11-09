Status: ready-for-human (built 2026-11-09, to try in the app; ADR-0016)

# Download whole Volumes for use without Astia

From [issues/01-download-whole-volumes.md](issues/01-download-whole-volumes.md). Glossary: **Volume**, **Image**, **Scan cache**, **Scan viewer**, **Re-scan**.

## In one line

A new **Church books** view lists each known parish's Volumes, with how much of each is on disk; from there a Volume is opened in the Scan viewer with no citation, or **downloaded**: every Image, full size and thumbnail, fetched into the Scan cache and kept there until removed.

## New term

**Downloaded Volume**:
A Volume asked to be kept whole in the Scan cache, so stepping through it works without Astia. Its Images don't count against the cap and aren't dropped as least recently viewed; removing the download hands them back to the cap's rules (nothing is deleted then). Kept for the install, like the cap, not per dataset.
_Avoid_: offline volume, pinned volume (a Pin is something else).

This changes the 2026-10-21 decision "the cap and least-recently-viewed rule apply to every Image alike": they still apply to every Image not in a Downloaded Volume. Viewing alone still never keeps anything; only asking for a download does. Worth an ADR (0016) when it lands.

## Answers to the ticket's open questions

### Size against the cap

- **Outside the cap.** A Volume is 100–500 MB; inside a 5 GB cap, a few downloads would push out everything viewed, and a download could be half evicted by later browsing, which is the failure the feature exists to prevent.
- Settings shows the two apart: "Scan cache: 1.2 GB of 5 GB · Downloaded: 450 MB in 1 Volume". **Clear** clears the cache only, not downloads (its dialog says so).
- Before starting, the menu item's confirm says the Volume's size as Astia lists it (count × ~2.5 MB, an estimate until done): "Download I Ab:5 (180 Images, about 450 MB)?"
- Removing a download (Settings, or the menu on that Volume) turns its Images back into ordinary cache: they're pruned to the cap at once, least recently viewed first.

### Pace, stopping and resuming

- **One download at a time**, a queue of Volumes behind it. Each Image goes through the Scan cache's existing one-at-a-time full-size lane, so a viewer request queued meanwhile goes first (the lane takes latest first and a download only ever has one Image waiting).
- **A gap of 1 s between Images** fetched from Astia, the same as `REQUEST_GAP_MS` for answers; Images already cached are skipped without a gap (as `isCached` lets the vision pass do). I Ab:5's 180 Images then take roughly 5–10 minutes.
- **Throttling and blips**: an Image Astia fails on is tried again after 30 s, three times, before the download stops; the viewer's own patience in `astia.ts` is left as it is.
- **Astia failing** (502, refused, notice page) after its retries stops the download, which is listed as **Stopped: Astia couldn't be reached**, with Resume.
- **Stop / Resume**: Stop leaves what's fetched and keeps it a Downloaded Volume, listed as incomplete ("120 of 180"). Resume carries on from the first Image not on disk. Quitting the app is a Stop; nothing resumes on its own at launch (opening the app offline shouldn't start hammering a recovering Astia).
- **Re-scan**: the download uses the app's cache (`switches: false`), so an Image gone with a re-scan stops it as **Re-scanned in Astia**; switching to the new filming in the Scan viewer, as today, drops the old Images and the download shows incomplete again, to Resume onto the new filming.

### Where it's asked for: the Church books view (Heikki, 2026-11-09)

A view of its own for the church books, not tied to a citation: opened from its own button in the chart's top-right corner, between Reminders (the flag) and Settings (the gear), as a dialog over the chart like the Reminders list. The changelog work adds a clock button there too; the corner button and its floating list should be one shared piece that Reminders, the changelog and Church books all use, so this builds on that once it lands rather than copying `reminders-dialog/button.ts`.

- **Parishes**: the parishes whose archives are known (`archives.ts`), one row per archive.
- **A parish's Volumes**, grouped by series (Pää- ja rippikirjat, Lastenkirjat, …) in Astia's order, as `archiveVolumes` lists them. Each row: label, years, Images on disk of total (known once Astia's list of Images has been asked for), size on disk, and its download state.
- **Open**: opens the Volume in the Scan viewer on Image 1 with no source, as a Reminder opens an Image today (`viewer.openImage`). This is the start of browsing without a citation; nothing in the viewer changes for it.
- **Download / Stop / Resume / Remove** on each Volume row; one being downloaded shows "42 / 180".
- **Settings** keeps only the totals ("Scan cache: 1.2 GB of 5 GB · Downloaded: 450 MB in 1 Volume") and a link to the view.
- No download controls or status in the Scan viewer; downloads are managed in the view. (A "Downloaded" mark beside the Volume's title there is left for after trying it.)

## Groundwork first (refactor, its own commit)

The Scan cache owns `settings.local.json` today: `readSettings`/`savedCap` and `setCap`'s read-modify-write live inside `scan-cache.ts`. Downloads would be a second writer of the same file, and two read-modify-writes can lose each other's change. So before the feature:

- **`settings-file.ts`**: the install's settings file, written through one serialized writer, each change on the file as it is now. The Scan cache reads and saves its cap through it, unchanged in behaviour.
- **The Scan cache keeps Volumes whole** as a mechanism of its own (see Server); it knows nothing about downloads beyond that.

Then downloads are a module of their own on top of the cache's public `image()`, not code inside it.

Also groundwork: `archives.ts` maps parish spellings to archive ids, so one archive has several keys and no name of its own. It becomes a list of archives, each with its name and the spellings that lead to it, so the view can list each parish once. `parishArchive` keeps its behaviour.

## Server

- The Scan cache keeps Volumes whole (`keep`, `release`, `kept`), saved through `settings-file.ts` in `settings.local.json` as `keptVolumes: [volumeId]` beside `scanCacheBytes`, read each time so every cache on the data folder honours them. `prune` and `clear` skip them, `used` leaves them out, and `status()` adds `kept: { bytes, volumes }`. `onDisk(volumeId)` says what of a Volume is on disk without asking Astia.
- A new module `astia/downloads.ts`: the queue of Volumes, the one running, its progress, Stop. Reads the Volume's list via `astia.volumeImages`, fetches each Image through `cache.image(…, 'full' | 'thumb', signal)`, aborting the signal on Stop.
- Routes, outside any dataset beside the others in `astia-routes.ts`:
  - `GET /astia/parishes`: the known parishes, each with its archive id.
  - `GET /astia/archives/:id/volumes`: the archive's Volumes, each with its Images on disk and download state.
  - `GET /astia/downloads`: every Downloaded Volume and its state (`queued | downloading | stopped | complete`, `cached`, `images`, `bytes`, `error?`).
  - `PUT /astia/volumes/:id/download`: download or resume (idempotent).
  - `POST /astia/volumes/:id/download/stop`: stop, keep.
  - `DELETE /astia/volumes/:id/download`: stop and remove.
- Progress reaches the client by polling `GET /astia/downloads` every 2 s while anything is queued or downloading, only while the Church books view or the Scan viewer is open. (Import progress streams; a poll is simpler here and nothing else needs a stream.)

## Tests

With `memory-astia.ts` and a temp data folder:

- A download fetches every full Image and thumbnail, skips those cached, and ends `complete`.
- A Downloaded Volume's Images survive pruning to a cap smaller than they are, and don't count in `used`; removing the download prunes them.
- A viewer request made mid-download is served before the download's next Image.
- Stop mid-way leaves `stopped` with what's fetched; Resume fetches only the rest.
- Astia failing stops it with the error; a re-scan stops it as re-scanned, and after `refresh` it's incomplete again.
- The setting survives reopening the cache; Clear leaves downloads alone.
- The parishes list each archive once; an archive's Volumes carry what's on disk.
- Client: the view's row actions for each download state, and Open calling `openImage` on Image 1.

## Not in this

- Browsing beyond opening a Volume: searching across parishes, adding parishes not yet in `archives.ts` from Astia, or Change Volume… with no source.

- Downloading a whole parish or Book at once (the Settings list could later take "Download every Volume of this Book").
- Resolving references never resolved before: that needs Astia's archive answers, which `.astia-cache` already keeps for good once fetched.
