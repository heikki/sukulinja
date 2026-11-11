Status: ready-for-agent

# Find any parish's church books in Astia

Glossary: **Church books**, **Volume**, **Book**, **Unlinked**.

The Church books view lists only the parishes whose Astia archive was looked up by hand (`PARISHES` in `src/server/citations/astia/archives.ts`, 14 today). Browsing the books of any other parish, or starting a tree with no references at all (its first Citation made from the scans, as one is made from a listed Volume), needs the app to find a parish's archive ("… seurakunnan arkisto") in Astia itself.

## Decisions (grilled with Heikki, 2026-11-11)

- **One set of parishes.** A parish found by search is used for everything a hand-looked one is: browsing its books and linking references to them. There aren't two kinds.
- **Kept per install, in the data folder** (beside `pins.local.json`), so every tree uses it. The 14 in `PARISHES` move there as its starting content; no parish list stays in code.
- **A parish has no name of its own.** It is an archive id and the reference spellings that map to it, shown everywhere by its Astia title ("Puumalan seurakunnan arkisto"). No free text, no guessing a base form from Astia's genitive.
- **A spelling gets its archive from an Unlinked reference.** A reference Unlinked because its parish's archive isn't known offers "Etsi arkisto Astiasta", the search filled in with the reference's parish ("Puumala"). The archive chosen becomes that spelling's archive, and every reference with the spelling then links into it. Another spelling of the same place ("Pieksamaki") is chosen once the same way.
- **The Church books view has a search too**, "Etsi seurakunta Astiasta", for a tree with no references yet. The archive chosen joins the install's parishes with no spelling. The view lists the tree's own archives first (most cited first, as now), then, apart, the install's other parishes by their Astia titles. Once a Citation is made into one, it is among the tree's own. Heikki: "Tuota voisi kokeilla" — try it and see.
- **A wrong choice is changed where it was made.** Where a reference shows its archive, "Vaihda arkisto" opens the same search; the change applies to every reference with that spelling, and their Links are worked out again.

## What Astia offers (found 2026-11-11)

- `arkistot.html` ("Selaa aineistoja") lists every fonds alphabetically with its creator in brackets ("Pieksämäen seurakunnan arkisto (Pieksämäen seurakunta)"), filtered by a "Hae listalta" box; `aineistot.html` is the detailed search. Both load their results in the browser; the `ws/` request behind them isn't known yet.
- `ws/aineisto/readOne.php?id=<fonds>` gives the creator (`relaatiot` → `T_R`, ROOLI "Arkistonmuodostaja", `T_ID` "EAC_…") and related archives (`A_R`, ROOLI "On jatkoa": Pieksämäki's names Jäppilä and Virtasalmi). Text comes as HTML entities.

## First step: find the search request

Astia is blocked in the cloud sandbox. Before any code, find the request `arkistot.html` or `aineistot.html` sends (browser DevTools on Heikki's Mac, or a fetch from where Astia is reachable): its path, parameters and answer. Whether search results can be narrowed to parish archives (those with an `I VÄESTÖREKISTERIARKISTO` series) depends on it.

## Left out

- Related archives ("On jatkoa"): not followed for now.
