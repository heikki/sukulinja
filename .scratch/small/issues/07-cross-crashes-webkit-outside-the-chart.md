Status: ready-for-agent

# Keep the cross from crashing WebKit outside the chart

Searching for a person in the tree view crashed the web view. WebKit's content process stopped on an internal assertion in `FontCascade::drawGlyphBuffer`, while it painted ordinary HTML text inside a flex layout.

This is the same crash as `5e4715d` fixed for the chart. The system font has no Latin cross (✝, `CROSS` in `tree-view/renderer.ts`), so WebKit draws it from a fallback font, and drawing that fallback glyph can crash it. That commit named Zapf Dingbats for the cross on the chart's SVG cards only. Every HTML view that shows the cross still leaves it to fallback:

- Person search results: `formatDates` puts "1890 – ✝" in each row's dates (the likely crash).
- Person panel: the life line (`.life .cross`) and the family lines (`person-panel/family.ts`).
- Reminder dialog: the person's dates (`reminder-dialog/helpers.ts`).
- Scan viewer: the cite picker and the Citations list (`scan-viewer/cite.ts`, `scan-viewer/citations.ts`).

## Fix

Add `'Zapf Dingbats'` to the root font stack in `src/client/styles.css`, just before `sans-serif`. Every HTML view inherits it, Lit shadow roots included, so a glyph missing from the system font comes from a named font instead of fallback. The look doesn't change, since Zapf Dingbats is the font the fallback picked anyway. Fields and buttons that set `font: inherit` pick it up too. The chart's own `.cross` rule can stay.

## Also left to fallback

The UI has other symbols the system font lacks, and each falls back to a different font. They could crash the same way:

- ✕: close buttons (`scan-viewer/toolbar.ts`, `reminders-dialog`). Zapf Dingbats has it, so the fix above covers it.
- ⚑: Reminders flag (`scan-viewer/nav.ts`, `person-panel/styles.ts`). Falls back to Menlo.
- ⇤ ⇥: first/last Image (`scan-viewer/nav.ts`). Fall back to Lucida Grande.
- ⓘ: "Old filming" (`scan-viewer/nav.ts`). Falls back to CJK Symbols.

Decide whether to swap these for small inline SVG icons, as the search field's magnifier already is, which takes them off font fallback altogether.

## Comments
