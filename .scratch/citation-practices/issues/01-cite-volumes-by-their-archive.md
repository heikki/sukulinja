# Cite a Volume by its archive

Status: ready-for-agent

ADR-0019. From [idea.md](../idea.md), suositus 1.

## What to build

1. **Source title with the archive.** `openAppCitations`'s `create` and `convert` take the Volume's archive title, and `sourceOf` titles a new source "<archive>, <Volume label>". `cite` in `citations.ts` resolves the archive already (`withArchive`); conversion resolves it the same way.
2. **A one-off script** retitles every Volume source the app made (publisher "Kansallisarkisto, Astia") in a dataset, asking Astia for each Volume's archive, like the conversion script. It prints what it changed. Heikki runs it on dev and prod data.
3. **Export `PAGE` as text** for a Citation of an Image: "<source title>, s. <Page number>. Kansallisarkisto, Astia, kuva <Image>. <address>". The page is left out when unknown. Both the GEDZIP and the 5.5.1 export.
4. **Import reads `page` from the Link**, not the text, so a round trip is unchanged.

## Acceptance

- Two Volumes of different parishes with the same label get two sources (the case from 2026-11-11: `juva-5` and `mikkeli-5`).
- The script retitles a dataset's sources and is a no-op the second time.
- The round-trip test passes with a Citation of an Image, its `PAGE` text in the `.ged`.
- `bun fmt`, lint, typecheck and tests pass.
