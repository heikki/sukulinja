# Cite a Volume by its archive

Status: needs-info

From [idea.md](../idea.md), suositus 1.

## Bug

A Citation made in the app cites its Volume's source, found by the base xref or, failing it, by title and publisher (`volumeSource` in `app-citations.ts`). The title is the Volume's label alone ("I Aa:5 Pää- ja rippikirjat (1790-1796)"), which many parishes share. So the first Citation in another parish's Volume of the same label cites the first parish's source.

Confirmed 2026-11-11 with `openAppCitations(db).create` for `juva-5`, then `mikkeli-5`, both labelled `I Aa:5 Pää- ja rippikirjat (1790-1796)`: both citations got source 1, `@ASTIA_JUVA_5@`.

## Fix, and why it needs a decision

The source's title should name its archive, as a citation of an archive's book does: "Juvan seurakunnan arkisto, I Aa:5 Pää- ja rippikirjat (1790-1796)". Then title and publisher tell a Volume's source apart again, as ADR-0016 means them to. But:

- **Existing sources keep the old title.** A dataset's sources made so far would have to be retitled, or two namings would live side by side (against one naming everywhere). That's a data migration, so it waits on the migration work ("Migrate database schema automatically").
- **The archive is found asynchronously** (`volumeArchive`); `create` and `convert` take it in, as `cite` already resolves it for the Link it gives back.

## Readable PAGE, with it

The same change is where a Citation of an Image gets readable text (idea.md, suositus 1): "…, s. 123. Kansallisarkisto, Astia, kuva 45. <url>". Today `page` holds the Image's address, and ADR-0013 makes that the Citation's page: a Mark sets it, the merge pairs by it, and the panel opens it. Writing the text into `PAGE` changes what `page` means, so it needs ADR-0013 amended first. One way: `PAGE` is written at export from what the Citation holds (archive, Volume, original page's Page number, Image, address), and read back on import from the Citation's Astia `OBJE`, so `page` itself is unchanged.

Suggested: one ADR covering both, then this ticket becomes ready-for-agent.
