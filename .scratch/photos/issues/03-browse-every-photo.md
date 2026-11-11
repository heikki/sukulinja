Status: needs-triage
Blocked by: 01

# Browse every Photo in a Photos view

Spec: `../spec.md`. Glossary: **Photo**, **Photos**, **Photo viewer**, **Church books**.

Heikki, 2026-11-11: browsing all photos, "vähän niin kuin oikeassa ylänurkassa oleva kirkonkirjojen valikko", since a Photo may be linked to no one or have no one tagged yet.

A **Photos** view opened from the top-right corner beside **Church books**, listing every Photo of the dataset as thumbnails, with how many people each is linked to or tagged in. Picking one opens the Photo viewer on it with no person.

## Open questions

- An import keeps only the Photos under people and families (`allMediaRefs` in `gedcom/media-refs.ts`, which the media ingest copies): an `OBJE` record nothing points at, or one only a source record points at, is dropped today. Whether the import should keep those, so they show here.

- Order: by who's in it, by date, or as the import listed them; and whether Photos with no one come first.
- Whether it waits for adding photos from disk, the main way a Photo with no one would arrive.

## Done when

- The Photos view lists every Photo and opens each in the Photo viewer.
- Checked in `bun dev` in dark mode.
