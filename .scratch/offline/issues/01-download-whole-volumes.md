Status: needs-triage

# Download whole Volumes for use without Astia

Glossary: **Volume**, **Image**, **Scan cache**, **Scan viewer**, **Link**.

Astia went down on 2026-10-21, apparently in Valtori's precautionary shutdown of state web services over a PHP vulnerability ([Yle](https://yle.fi/a/74-20252571)). The app then works only from what it has cached.

## What works offline today (checked 2026-10-21, Astia refusing connections)

- **Links resolve** from Astia's answers, which `.astia-cache` keeps forever: a reference resolved before resolves again, Box and all.
- **Full Images viewed before** load from the Scan cache in milliseconds, as does a Volume's list of Images and the citations that link into it.
- **The re-scan check** fails quietly (`Latest` turns the 502 into null) and is asked again next time the Scan viewer opens.
- **Thumbnails** are only the Scan viewer's placeholder while the full Image loads. One that isn't cached fails unseen when the full Image is cached, so there's nothing to fall back to.
- **Not offline**: a reference never resolved shows "Astia error", and an Image never viewed won't load. Nothing remembers the outage, so opening a person again retries; no restart is needed.

## Decided (2026-10-21)

- **Use what's cached; no separate "prepare for offline" step.** The Scan cache's cap and least-recently-viewed rule apply to every Image alike.
- **Wording stays** "Astia error … Open the person again to retry."

## The idea

Later, a way to download a whole Volume into the Scan cache, so stepping through it works offline: for example, from the Scan viewer for the Volume shown.

## Open questions

- **Size against the cap**: a Volume is a few hundred Images at ~2.5 MB each (I Ab:5 has 180, ~450 MB). Does a downloaded Volume count against the cap, and survive least-recently-viewed eviction?
- **Pace**: Astia throttles. Full Images are fetched one at a time, and the vision pass paces its own. How fast, and can it be stopped and resumed?
- **Where it's asked for**: the Scan viewer's right-click menu, per Volume, or a list in Settings.
