Status: ready-for-agent

# Ask in the Scan viewer before switching a re-scanned Volume

Parent: `01-detect-a-rescan.md`. Glossary: **Re-scan**, **Scan viewer**, **Mark**, **Vision match**, **Page pin**.

Images load as `<img>` (`scan-viewer/frame.ts`), so the viewer only learns that one failed, not why. When an Image of the Volume shown fails, the viewer asks the app whether Astia re-scanned the Volume (`GET /astia/volumes/:id/rescan`, `05`), once per Volume while it's shown.

```
┌ Scan viewer — I Ab:9 Lastenkirjat ───────────┐
│ Astia has replaced this Volume's scans with  │
│ a new filming (455 → 434 Images). Made on    │
│ the old photographs, and left out after      │
│ switching:                                   │
│   • your Mark: <person>, p. 463, Image 247   │
│   • Page pin pp. 234–235, Image 125          │
│                                              │
│        [Not now]   [Use the new filming]     │
└──────────────────────────────────────────────┘
```

## Do

- On a re-scan, the viewer shows it over the stage in place of the failed Image's "couldn't load" note (`scan-viewer/note.ts`), with the Image counts and what switching leaves out: hand marks first, named by the person and source where the Volume's citations (`VolumeCitation`) have one, else by record number; then vision matches; then Page pins. A long list folds after a few, with a count.
- **Use the new filming**: `POST …/rescan`, then the viewer takes the Volume's new list: its Image count (fixes the count staying at the old filming's until the Volume is reopened), the Image shown clamped to it and loaded again, and the Volume's citations and Links resolved anew.
- **Not now**: the note goes; Images on disk still show, those that aren't stay "couldn't load". Asked again the next time the Volume is opened.
- No re-scan (`{ rescan: null }`): the usual "couldn't load" note with its retry.

## Tests

- A failed Image of a re-scanned Volume shows the question with its stale marks named; a failed Image of one that isn't shows the usual note.
- Use the new filming reloads the count and the Image; Not now leaves the cached list as it was.
- The Volume is asked about once while shown, however many Images fail.

## Not here

Saying in the person panel that a source's Mark was made on a replaced filming (`07`).
