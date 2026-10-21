Status: needs-triage

# Say in the person panel that a source's Mark was made on a replaced filming

Parent: `01-detect-a-rescan.md`. Glossary: **Re-scan**, **Mark**, **Link**, **Certainty**, **Estimated**.

After switching to a re-scanned Volume's new filming (`06`), a source whose Mark was made on the old photographs shows as an ordinary estimate: the person panel gives no hint that it was marked once and wants marking again.

## Open questions (decide before agent work)

- Whether it's worth it at all, given re-scans are rare (1 in 208 cached Volumes so far) and `06` lists the stale marks when switching.
- How resolution says so: a flag on the estimated Link ("marked on a replaced filming, was Image 247"), or a separate list the panel asks for.
- Whether vision matches made on the old filming say so too, or only hand marks.

## Comments

**Triage 2026-10-21: parked until the next re-scan.** Not worth building for one re-scanned Volume, but not wontfix either: if Astia re-scans another pinned Volume, come back to it. Leaning on the open questions, should it be built:

- **Shape**: a flag on the estimated Link, carrying the old Image number ("marked on a replaced filming, was Image 247"), so the panel needs no separate request.
- **Which pins**: hand marks only. Vision matches can be run again by the script.
