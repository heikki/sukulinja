Status: needs-triage

# Say in the person panel that a source's Mark was made on a replaced filming

Follows the shipped re-scan work (4a809a5, 2e0962b). Glossary: **Re-scan**, **Mark**, **Link**, **Certainty**, **Estimated**.

After switching to a re-scanned Volume's new filming (asked in the Scan viewer, 2e0962b), a source whose Mark was made on the old photographs shows as an ordinary estimate: the person panel gives no hint that it was marked once and wants marking again.

## Open questions (decide before agent work)

- Whether it's worth it at all, given re-scans are rare (1 in 208 cached Volumes so far) and the Scan viewer already lists the stale marks when switching.
- How resolution says so: a flag on the estimated Link ("marked on a replaced filming, was Image 247"), or a separate list the panel asks for.
- Whether Matches made on the old filming say so too, or only hand marks.

## Comments

**Triage 2026-10-21: parked until the next re-scan.** Not worth building for one re-scanned Volume, but not wontfix either: if Astia re-scans another pinned Volume, come back to it. Leaning on the open questions, should it be built:

- **Shape**: a flag on the estimated Link, carrying the old Image number ("marked on a replaced filming, was Image 247"), so the panel needs no separate request.
- **Which pins**: hand marks only. Matches can be run again by the script.

**2026-10-22:** resolution now reads a Volume's pins split by filming (`splitVolume` in `src/server/citation-scans/filming.ts`). If this is built, the old Image number for the flag comes from the split's `stale.records`, and for a Reference pin from `leavesOut`.
