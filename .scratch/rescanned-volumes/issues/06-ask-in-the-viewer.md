Status: resolved

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

## Answer

- The viewer state (`state/viewer.ts`) gains `rescan`, `imageFailed`, `switchFilming` and `keepFilming`; the component calls `imageFailed` when the full Image fails, and shows `sl-scan-rescan` (`scan-viewer/rescan.ts`, its lines from `stale-lines.ts`). Asked once per Volume while shown; showing another Volume or closing the viewer asks again.
- Switching sets the count from the new list, reloads the Volume's citations and the person's Links (`Selected.relink`), follows the source's Link resolved anew, and loads the Image again.
- Lines name hand marks, then vision matches, by person and entry from the Volume's citations (record number matched by the URL's `itemId`), else by record; then each Page pin once. Rejections aren't listed.
- Found while trying it: the server keeps a Volume's citation rows until the pins change, so after switching "People here" stayed empty. The resolution stamp now also counts lists kept anew (`Astia.refreshed`).
- Tried in the dev app on 2026-10-21 with I Ab:9's old list restored: p. 463 opened on the old Image 247 with its vision Box; Image 248 asked, naming the vision match; Not now left "Image unavailable" and didn't ask again; reopening asked again; switching landed on Image 232 of 434, Estimated, with the person listed under People here.
- Added the same day: an Image shown from the Scan cache never fails, so a re-scan went unnoticed while its Images were cached (p. 463's old Image 247 was). Showing a Volume now asks about it too, in the background, and the question is always a banner along the top of the stage, over an Image shown from the cache or one that failed (with "Image unavailable" beneath it). The server peeks at each Volume's list once per run (`Astia.peekImages`, again once the list is kept anew): one request of about 130 KB, no Images. A failing Image asks again only when showing the Volume got no answer.
- Tried in the dev app: opening p. 463 showed the old Image 247 with the banner over it; switching from the banner landed on Image 232 of 434.
- While the Volume shown is known to be re-scanned and not switched to (`Viewer.oldFilming`, which outlasts Not now), an Image that fails shows "Image unavailable" without Retry: it can't succeed. An Image Astia no longer has isn't asked for once a peek found it gone (`Astia.isGone`), and a failed Image drops the last one drawn, so stepping past unavailable Images doesn't flash it.
- A Volume on its old filming is read-only until switched: the server refuses a Mark into it (on an Image or the Volume alone) and a Discard once a peek this run found it re-scanned, and the viewer opens no right-click menu there (Change Volume… included) and shows no Confirm (`Viewer.oldFilming`). What was saved on the old filming would be left out once switched.
- After Not now, an "Old filming" chip beside the Image count in the nav says the Volume is still on the old filming, and read-only; clicking it brings the question back (`Viewer.askAgain`).
