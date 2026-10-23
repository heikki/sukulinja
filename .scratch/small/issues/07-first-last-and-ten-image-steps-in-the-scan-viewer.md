Status: needs-triage

# First, last and ten-Image steps in the Scan viewer's page nav

Glossary: **Scan viewer**, **Volume**, **Image**, **Box** (`src/server/citation-scans/CONTEXT.md`).

The page nav (`scan-viewer/nav.ts`) steps one Image at a time with ‹ and › (or ←/→), or jumps by typing an Image number. Getting to the start or end of a Volume, or skimming through it to find where an estimate went wrong, takes many presses or typing a number.

Add buttons for the first Image, ten back, ten forward and the last Image, around the ones there now. They're icons, as ‹ and › are, not text, each with an `aria-label` ("First image", "Back 10 images" …):

```
⇤  «  ‹  [n] of N  ›  »  ⇥
```

## Open questions

- **Keys.** Home/End for first and last, Shift+←/→ for ten, with the same pressed look a held ← or → gives its button now (`stepOf` in `scan-viewer/keys.ts`, `pressed` in `nav.ts`).
- **Near the ends.** −10 from Image 4 goes to Image 1, or is disabled. Going to the end seems more useful; first and last are disabled at their own end as ‹ and › are.
- **Last before the count.** The count comes from Astia after the Volume opens. Until it does, last and +10 are disabled, or +10 steps without a bound as › does.
- **Step size.** Ten Images, or a step that suits the Book: lastenkirjat number two pages per Image, rippikirjat one spread per Image.
- **Width.** The nav also holds Cancel and Save while a Box is pending and ⓘ Old filming, so it shouldn't outgrow a narrow window.

## Comments
