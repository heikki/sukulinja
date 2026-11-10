Status: ready-for-agent

# Cite an Image found by browsing the church books

Glossary: **Citation**, **Church-book reference**, **Scan viewer**, **Mark**, **Box**.

The Church books view opens a Volume in the Scan viewer with no source, as an Image's Reminder does. There, the menu offers only a Reminder: "New citation for…" is offered only with a source, so a Citation can't yet be made from an Image found by browsing.

## Decisions

Settled with Heikki on 2026-11-10.

- **One flow.** Opened with no source, the Scan viewer's menu over the full Image offers the same "New citation for…" as with one: the Selected person and their family, then "Someone else…", a Box drawn for the entry, and the same optional text ("What the entry is"). "Place citation here" isn't offered, as there's no source's Citation to place.
- **What the Citation says is as today.** It cites the Volume's source (Kansallisarkisto, Astia), its Image and Box, with the typed text if any. No page number is asked, and it isn't tied to a fact of the person (birth, marriage); that would be its own feature, for every Citation made in the app.
- **After saving, the viewer opens on the new Citation as its source**, however it was opened: with no source, or on another Citation (today it stays on that one). So making a Citation always leaves you on it, and there's one way to fix a wrong page: step to the right Image and "Place citation here", named under it; its Box's Edit and Delete work at once. A Citation made for someone other than the Selected person selects them, as picking a person beside the scan does (ADR-0011).
- **Only the Volumes the Church books view lists.** A tree with no references lists none; getting its first Citation from the scans is ticket 01's. This ticket doesn't wait on 01.

## For the implementation

The pending Citation is held as "the source's change" in `src/client/state/viewer.ts`: `setBox` and `save` stop when there's no source. A new Citation's pending Box belongs to the Volume and Image shown, not to a source, so it should be told apart from a change to the source's Link in the state itself rather than special-cased where the source is null. Update the glossary's **Scan viewer** and `openImage`'s comment ("nothing to edit but Reminders") with it.

Raised by Heikki on 2026-11-09 while trying the Church books view.
