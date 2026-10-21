# Research: GEDCOM 7 and GEDZIP tooling, spec rules and MyHeritage upload, for the export tickets

Researched 2026-10-21. Spec version throughout: FamilySearch GEDCOM **7.0.18**, the published one ([HTML](https://gedcom.io/specifications/FamilySearchGEDCOMv7.html); [release v7.0.18, 2026-02-17](https://github.com/FamilySearch/GEDCOM/releases/tag/v7.0.18)). A 7.1 draft lives on the spec repo's `v7.1` branch; where it was checked, it says the same as 7.0.18.

## Summary

- **Validators exist and one runs under Bun.** [`gedcom7code/js-gedcom`](https://github.com/gedcom7code/js-gedcom) was written by one of the spec's two managing editors. It is plain ES modules with no dependencies, and it checks a `.ged` against the official registry's `g7validation.json`: misplaced tags, cardinality, payload types, enumerations, pointer targets, `CONC`, undeclared extensions. I ran it under Bun 1.4.3 on the official test files and on an export-shaped sample (Astia `OBJE` with `CROP`, two citation `NOTE`s, `UID`, an escaped local `FILE`). It found no errors in either. It does not check `FILE` paths, `CROP` against the image size, or GEDZIP contents.
- **For GEDZIP, the strongest checker is [ArmidaleSoftware/gedcom7](https://github.com/ArmidaleSoftware/gedcom7)'s `GedValidate`** (C#/.NET 8, MIT, v1.6.2 of 2026-08-03). It percent-decodes every local `FILE` and fails if the zip lacks it. Release binaries exist only for Windows and Ubuntu.
- **Official test material** is [maximal70.ged / maximal70.gdz and ~25 smaller files on gedcom.io](https://gedcom.io/tools/#example-familysearch-gedcom-70-files), plus paired 5.5.1/7 files in [gedcom7code/test-files](https://github.com/gedcom7code/test-files). `maximal70.gdz` already covers ticket 03's escaping case: `FILE` names a file with a percent-escaped non-ASCII letter, and the zip entry has the plain letter.
- **Two spec findings change ticket 04:**
  - `CROP` is "only valid when the superstructure links to a `MULTIMEDIA_RECORD` with at least 1 `FILE` substructure that refers to an external file with a defined pixel unit". So the `OBJE`'s `FILE` must be the JPEG (Astia's `ws/getFile.php?…`), not the viewer page that becomes `PAGE`.
  - GEDCOM 7 has **no structure for an image's pixel width and height**. The ADR's "gives back the same dataset" can't hold for the Image's pixel size unless it travels in a note or an extension, or is fetched again.
- **GEDCOM 5.5.1 adds constraints that ticket 06 doesn't list:**
  - `HEAD.SOUR` and `HEAD.SUBM` are required, so a `SUBM` record has to be written.
  - The 255-character limit counts the line terminator.
  - `CONC` must split at a non-space.
  - Every `@` is doubled.
  - `FORM` is `jpg`, not `image/jpeg`.
  - `LANG` is a language name (`Finnish`), not `fi`.
- **No JS library is a drop-in writer for ticket 03.** js-gedcom's serializer drops the xref of any record nobody points to and regroups records by type. The most complete newer package, [`@kleiobase/gedcom-converter`](https://www.npmjs.com/package/@kleiobase/gedcom-converter), writes 7.0.18, 5.5.1 and GEDZIP, but the bugs below rule it out as a dependency:
  - its 5.5.1 lines run 1–2 characters over the limit;
  - it rewrites note text;
  - its zip entries lack the UTF-8 name flag;
  - its `validate` passed a file with four structural errors.
- **MyHeritage documents almost nothing.** Its help centre says how to upload a GEDCOM. It says a GEDCOM "doesn't include the actual photos" and that "MyHeritage is able to import any GEDCOM file with links for the photos". It names no GEDCOM version, no GEDZIP or zip support, no size limit and no use of `_UID`. The by-hand upload in ticket 06 remains the only test.

## 1. Official validation and test material

### Validators and checkers

| Tool                                                                                                                                                           | What it checks                                                                                 | How to run                                                                                                 | License          | Latest                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------- |
| [gedcom7code/js-gedcom](https://github.com/gedcom7code/js-gedcom)                                                                                              | `.ged` only, against `g7validation.json` (details in section 3)                                | ES modules; in-browser page at [gedcom7code.github.io/js-gedcom](https://gedcom7code.github.io/js-gedcom/) | MIT or Unlicense | last commit 2024-02-01, no releases   |
| [ArmidaleSoftware/gedcom7](https://github.com/ArmidaleSoftware/gedcom7) `GedValidate`                                                                          | `.ged` and `.gdz`; schema from a local checkout of GEDCOM-registries; also loads 5.5.1 schemas | CLI, .NET 8                                                                                                | MIT              | v1.6.2, 2026-08-03; pushed 2026-10-18 |
| Same library, `GedCompare`                                                                                                                                     | Compatibility score: compare your re-export of `maximal70.ged` with the original               | CLI, or [web](https://magikeygedcomconverter.azurewebsites.net/Compatibility)                              | MIT              | as above                              |
| [@domorium/validator](https://www.npmjs.com/package/@domorium/validator)                                                                                       | 5.5.1 and 7.0: tags, cardinality, payloads, enums, pointers                                    | npm, TypeScript; `engines` node ≥22                                                                        | MIT              | 2.0.1, 2026-09-01                     |
| [ged-inline.org](https://ged-inline.org), [gedcom.tools](https://gedcom.tools/), [magikey Validate](https://magikeygedcomconverter.azurewebsites.net/Validate) | Web validators                                                                                 | upload to a third-party server                                                                             | —                | not examined                          |

All of these are listed on [gedcom.io/tools](https://gedcom.io/tools/#development-aids), which says they "are authored and maintained by third parties and may vary in license, quality, and correctness".

**What I verified by running them** (scratch copies, nothing installed in the repo):

- **js-gedcom (commit `9296068`) under Bun:** no errors on `maximal70.ged`, the `gedcom.ged` inside `maximal70.gdz`, and the export-shaped sample. On a broken file it reported each planted error:
  - `CONC` in 7.0;
  - a non-integer `TOP`;
  - two `SEX`;
  - two `PAGE`;
  - a citation `SOUR` pointing at an `INDI`;
  - `FILE` without `FORM`;
  - an undocumented `_UID` (as a warning).

  It did not flag `FILE ../escape.jpg`, and it warns "parser does not understand datatype …type-FilePath" for every `FILE`.

- **@domorium/validator 2.0.1 under Bun:**
  - 7.0: it found the same structural errors, but not the `CONC` in a 7.0 file.
  - 5.5.1: it found the missing `HEAD.SOUR`/`HEAD.SUBM` and `FORM image/jpeg` outside the 5.5.1 enum. It did not flag a 400-character line or `LANG fi`.
- **ArmidaleSoftware GedValidate:** not run (no .NET here, no macOS binary). From [`Gedcom7/GedzipFile.cs`](https://github.com/ArmidaleSoftware/gedcom7/blob/main/Gedcom7/GedzipFile.cs), it percent-unescapes each local `FILE` and reports "`<gdz> is missing <path>`" when no zip entry has that name. The usage in [`GedValidate.cs`](https://github.com/ArmidaleSoftware/gedcom7/blob/main/GedValidate/GedValidate.cs) is now `GedValidate <gedcomRegistriesPath> <filename>`, unlike the one-argument form in its README. Its `FilePath` check is only .NET's `Uri.IsWellFormedUriString`.

**Could we run one on our export?** Yes:

- js-gedcom installs as a pinned git dependency (`bun add -d github:gedcom7code/js-gedcom#9296068` worked; deep imports like `js-gedcom/gedcstruct.js` resolve). It needs `g7validation.json` (327 KB), which the web page fetches from GitHub at load. A test would pin a copy.
- GedValidate is a by-hand check for the `.gdz`: it needs .NET 8 on macOS, or a Linux box.
- The web validators mean uploading the tree to someone's server. js-gedcom's page says it runs "entirely in your browser, with no access to a server except to load this page", and its source matches that: `FileReader` plus one fetch of the registry JSON ([simpleValidator.js](https://github.com/gedcom7code/js-gedcom/blob/main/simpleValidator.js)).

### Test files

- **On [gedcom.io/tools](https://gedcom.io/tools/#example-familysearch-gedcom-70-files)**:
  - `maximal70.ged` "attempts to exercise all standard tags in various locations, and all standard enumeration values";
  - `maximal70.gdz` adds media;
  - `minimal70.gdz` is "the smallest legal FamilySearch GEDZIP 7.0 file";
  - `escapes.ged` covers `@` doubling;
  - `filename-1.ged` and `obje-1.ged` cover `FILE` payloads and `OBJE` records;
  - `long-url.ged` has a very long line;
  - there are also `maximal70-memories1/2.ged` (`INDI.OBJE`, `SOUR.OBJE`), `notes-1.ged` and `xref.ged`.
- **Inside `maximal70.gdz`**:
  - `gedcom.ged` dated 2026-07-28;
  - `FILE media/…Bront%C3%AB.jpg` stored as zip entry `media/…Brontë.jpg`, with general-purpose bit 11 (UTF-8 name) set;
  - remote `FILE http://host.example.com/…`;
  - `CROP` under `SOUR.OBJE` and under `SUBM.OBJE`.
- **[gedcom7code/test-files](https://github.com/gedcom7code/test-files)** (Unlicense, pushed 2025-11-19) has folders `5/` and `7/` with the same names: a 5.5.1 file and its expected 7.0 conversion. Examples are `atsign.ged`, `obje-1.ged`, `notes-1.ged`, `lang-all.ged` and character-set variants. Its README warns that "simple file comparison is not always sufficient", because substructure order across types, date spellings and extension tags can differ without changing meaning.

### Machine-readable spec and registry

- **[FamilySearch/GEDCOM `extracted-files/`](https://github.com/FamilySearch/GEDCOM/tree/main/extracted-files)** (Apache-2.0). It is generated from the spec and attached to each release: `cardinalities.tsv`, `substructures.tsv`, `payloads.tsv`, `enumerations.tsv`, `grammar.abnf`, `grammar.gedstruct`, and a `tags/` folder of YAML per term ([gedcom.io/tools](https://gedcom.io/tools/#yaml-file-format)).
- **[FamilySearch/GEDCOM-registries](https://github.com/FamilySearch/GEDCOM-registries)** (pushed 2026-10-14). It holds YAML for standard and extension terms in the [format at gedcom.io/terms/format](https://gedcom.io/terms/format). Its `generated_files/` has `g7validation.json` (last regenerated 2026-06-02) and `g71validation.json`. `manifest/standard/` has 5.5.1, 7.0 and 7.1 manifests.
  - The extension manifest has 12 entries (Ancestry, MagiKey and two generic ones). None is `_UID`, `_PRIM` or any MyHeritage tag ([manifest](https://github.com/FamilySearch/GEDCOM-registries/blob/main/manifest/extension/manifest-extensions-en-US.tsv)).

## 2. GEDCOM 7 rules the export depends on

All quotes are from the [7.0.18 spec](https://gedcom.io/specifications/FamilySearchGEDCOMv7.html); the source chapter is in the [spec repo](https://github.com/FamilySearch/GEDCOM/tree/main/specification).

### GEDZIP layout and FILE paths

- **Entries** ([ch. 4](https://gedcom.io/specifications/FamilySearchGEDCOMv7.html#gedzip)):
  - "An entry with name `gedcom.ged` containing a data stream."
  - "An entry for each _local file_ `g7:type-FilePath` payload in `gedcom.ged`, with the same zip _file name_ as the payload."
  - "If there is a local file named `gedcom.ged`, it must be renamed …"
- **Escaping:** "All file names inside a GEDZIP are case-sensitive UTF-8. Whereas a `g7:type-FilePath` payload must percent-escape characters in the file name that cannot appear literally in a URI reference or valid URL string, zip _file names_ are not percent-escaped."
- **Compression:** "Applications may find performance improved by not applying compression at all or by applying compression only to the text files (including `gedcom.ged`)". Avoid `META-INF` and `MANIFEST.MF`. Use the extension `.gdz`.
- **Zip side, not GEDCOM:** a UTF-8 name needs general-purpose bit 11: "If this bit is set, the filename and comment fields for this file MUST be encoded using UTF-8". Without it, readers assume IBM Code Page 437 ([APPNOTE 6.3.10 §4.4.4 and Appendix D](https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT)).
  - fflate 0.8.3, which the app already uses, sets the bit on non-ASCII names when zipping (checked).
  - fflate's unzip reads names as Latin-1 when the bit is unset (`node_modules/fflate/esm/index.mjs`, `!(flag & 2048)`).
- **File path** ([§ File Path](https://gedcom.io/specifications/FamilySearchGEDCOMv7.html#file-path)):
  - The payload is a WHATWG "valid URL string".
  - `ftp`, `http` or `https` is "a web-accessible file".
  - "Local file URLs must not be used in FamilySearch GEDZIP". This means `file:` URLs.
  - A local file is a URL with no scheme, "not beginning with `/`", "not containing any path segments equal to `..`", "not containing a reverse solidus character … or `banned` character", and "no query or fragment".
  - "It is recommended that local files use the directory prefix `media/`".
  - In practice, a file name containing a space, `%`, `?` or `#` must have it escaped in `FILE`. `filename-1.ged` has `most/paths%3Fget%23escaped%5Blike%5Dthis`.
- **Remote files under a citation are allowed.** `SOURCE_CITATION` has `+1 <<MULTIMEDIA_LINK>> {0:M}`. `MULTIMEDIA_LINK` is a pointer only: `n OBJE @<XREF:OBJE>@`. The `MULTIMEDIA_RECORD` takes `FILE <FilePath> {1:M}` with `FORM <MediaType> {1:1}`. Nothing restricts which kind of `FILE` a citation's `OBJE` may name. Only local files go into the GEDZIP. The FAQ says a tool "should convert local file URLs to relative paths within the resulting GEDZIP file" ([Technical FAQs](https://gedcom.io/techfaqs/#how-do-i-reference-local-files)).
- **URL in `PAGE`.** The FAQ recommends it: "the URL can be placed in the `PAGE` structure", e.g. `3 PAGE Memorial: 1075, URL: https://…` ([Technical FAQs](https://gedcom.io/techfaqs/#how-do-i-record-the-url-of-a-source)).

### CROP

From [`g7:CROP`](https://gedcom.io/specifications/FamilySearchGEDCOMv7.html#CROP):

> A subregion of an image to display. It is only valid when the superstructure links to a `MULTIMEDIA_RECORD` with at least 1 `FILE` substructure that refers to an external file with a defined pixel unit.
>
> `LEFT` and `TOP` indicate the top-left corner of the region to display. `WIDTH` and `HEIGHT` indicate how many pixels wide and tall the region to display is. If omitted, `LEFT` and `TOP` each default to 0; `WIDTH` defaults to the image width minus `LEFT`; and `HEIGHT` defaults to the image height minus `TOP`.
>
> It is recommended that `CROP` be used only with a single-FILE `MULTIMEDIA_RECORD`.
>
> The following are errors: `LEFT` or `LEFT` + `WIDTH` exceed the image width. `TOP` or `TOP` + `HEIGHT` exceed the image height. `CROP` applied to a non-image or image without a defined pixel unit.

- `CROP` is a substructure of the **link** (`MULTIMEDIA_LINK`), not of the record. Each citation can therefore carry its own Box while sharing one `OBJE` record per Image.
- `TOP`, `LEFT`, `HEIGHT` and `WIDTH` are `Integer` (non-negative).
- The units are pixels of the file `FILE` names. The spec has **no structure for the file's own width and height**: they come from the image itself. So `CROP` does not require pixel dimensions to be written anywhere, only that the file is an image whose size is known when it is read. A validator can check the "exceed" errors only by opening the image. None of the tools above does.

### UID

From [`g7:UID`](https://gedcom.io/specifications/FamilySearchGEDCOMv7.html#UID): "A globally-unique identifier of the superstructure, to be preserved across edits. If a globally-unique identifier for the record already exists, it should be used without modification, not even whitespace or letter case normalization. It is recommended that new globally unique identifiers be created and formatted using the UUID production specified in RFC 9562 Section 4." A note describes the old 16-byte-plus-2-byte-checksum form and discourages checksums.

- Cross-reference ids are not durable: "Cross-reference identifiers are not retained between data streams and should not be made visible to the user" ([§ Lines](https://gedcom.io/specifications/FamilySearchGEDCOMv7.html#lines)).
- The FAQ: "cross-reference identifiers are not durable across import-export cycles … use one of the durable identifier structures: `UID`, `REFN`, or `EXID`" ([Technical FAQs](https://gedcom.io/techfaqs/#how-do-i-link-to-individual-structures-within-a-familysearch-gedcom-file)).
- "A record to which no structures point may have a cross-reference identifier, but does not need to have one."

### HEAD

The `HEADER` grammar ([§ HEADER](https://gedcom.io/specifications/FamilySearchGEDCOMv7.html#HEADER)):

- Only `GEDC` `{1:1}` with `VERS` `{1:1}` is required. Everything else is optional: `SCHMA`, `SOUR` (with `VERS`, `NAME`, `CORP`, `DATA`), `DEST`, `DATE`/`TIME`, `SUBM`, `COPR`, `LANG <Language>`, `PLAC.FORM`, one `NOTE`.
- "It is recommended that `GEDC` be the first substructure of the header."
- `VERS` "must include the major and minor version (for example, `7.0`); it may include the patch".
- There is no `CHAR` and no `GEDC.FORM`. The [7.0.0 changelog](https://github.com/FamilySearch/GEDCOM/blob/main/changelog.md) lists "`HEAD`.`CHAR`, `HEAD`.`GEDC`.`FORM`" among removed tags, and says "`HEAD`.`SOUR`, `HEAD`.`SUBM`" are now optional.
- Encoding: "7.0 only uses the UTF-8 character encoding", and "The first character in each data stream should be U+FEFF, the byte-order mark" ([ch. 1](https://gedcom.io/specifications/FamilySearchGEDCOMv7.html#characters)).

### CONT, line length, `@`

- **Splitting** ([§ Lines](https://gedcom.io/specifications/FamilySearchGEDCOMv7.html#lines)): "If a payload contains a line terminator, the payload is split on the line terminators into several payloads. … each subsequent split payload is encoded as the line value of a line continuation pseudo-structure … The tag of a line continuation pseudo-structure is `CONT`." CONT lines "must appear immediately following the line whose payload they are encoding and before any other line."
- **No `CONC`:** "`CONC` does not appear in version 7." "Previous versions limited the number of characters that could appear in a tag, cross-reference identifier, and line-value. Those restrictions were removed in version 7.0."
- **Terminators:** "A line terminator may be a carriage return U+000D, line feed U+000A, or a carriage return followed by a line feed. The same line terminator should be used on every line of a given document."
- **`@`:** "If the first character of the string stored in a line string is U+0040 (`@`), the line string must escape that character by doubling that `@`." This holds for each `CONT` line too. The spec's own example is `2 CONT @@me and @I are my social media handles`.
  - js-gedcom rejects `2 CONT @alkaa…` as unparseable. A serializer that only escapes the first line would write an invalid file.
- **Whitespace:** "All characters in a payload must be preserved in the corresponding line value, including preserving any leading or trailing spaces."

### "First is preferred" and the profile photo

- **Order:** "The order of substructures of a single type indicates user preference, with the first substructure being the most-preferred value, unless a different meaning is explicitly indicated" ([§ Structures](https://gedcom.io/specifications/FamilySearchGEDCOMv7.html#structures)). The grammar notes add: "If an application needs to display just 1 of several `NAME`s, `BIRT`s, etc, they should show the first such structure".
- **Photos:** the [7.0.0 changelog](https://github.com/FamilySearch/GEDCOM/blob/main/changelog.md) says "The universal 'preferred first' rule does apply to picking profile pictures and display names." The FAQ is more cautious: "There is no standard tag for this purpose in version 7.0. The first `MULTIMEDIA_LINK` in a structure is the 'most-preferred' external object, but that does not necessarily mean it is either an image or a profile image" ([Technical FAQs](https://gedcom.io/techfaqs/#how-do-i-flag-a-primary-or-profile-photo)).
- **Exception:** the only one named is `FAM.CHIL`, which is in birth order.

### Extensions

A `_TAG` is "documented" only when `HEAD.SCHMA.TAG` maps it to a URI; otherwise it is undocumented, and "It is recommended that documented extension tags be used instead of undocumented extension tags wherever possible" ([§ Extension Tags](https://gedcom.io/specifications/FamilySearchGEDCOMv7.html#extension-tags)). A note's payload is free text, so `NOTE Imported page: <url>` is standard GEDCOM.

## 3. GEDCOM 5.5.1, and converting between 5.5.1 and 7

Source: [The GEDCOM Standard Release 5.5.1, dated 15 November 2019](https://gedcom.io/specifications/ged551.pdf). Page numbers are the PDF's own.

- **Line length (p. 11):** "The total length of a GEDCOM line, including level number, cross-reference number, tag, value, delimiters, and terminator, must not exceed 255 (wide) characters." "Any length constraints are given in characters, not bytes." With CRLF, that leaves 253 characters before the terminator.
- **CONC (pp. 10, 38, 85).** The three places say different things:
  - p. 10: "If a concatenated line is broken at a space, then the space must be carried over to the next line."
  - p. 38: "break the text line in the middle of a word, or if at the end of a word, to add a space to the first of the next CONC line. Otherwise most operating systems will strip off the trailing space".
  - p. 85: "Values that are split for a CONC tag must always be split at a non-space. If the value is split on a space the space will be lost".

  The only split that satisfies all three is between two non-space characters.

- **Which values take CONC/CONT:** only those the grammar gives `[CONC|CONT]` under, mostly `NOTE`, `TEXT`, `SOUR` titles, `PUBL`, `AUTH` and `COPR`. `FILE` and `PAGE` have none. A `FILE` URL must therefore fit on one line.
- **`@` (p. 12):** `any_char:= [… | (0x40)+(0x40)]`, so every `@` inside a line value is written `@@`, not only a leading one. The 7.0 spec notes that this "was not widely implemented in practice". The editors' 5.5.1→7 test files decode an internal `@@` to `@` (`5/atsign.ged` → `7/atsign.ged` in [test-files](https://github.com/gedcom7code/test-files)).
- **User tags (p. 13):** "All user-defined tags that have not been defined in the GEDCOM standard, must begin with an underscore character". `_UID` is legal. 5.5.1 has no `UID`.
- **HEAD (p. 23):**
  - required: `SOUR <APPROVED_SYSTEM_ID> {1:1}` (Size 1:20), `SUBM @<XREF:SUBM>@ {1:1}`, `GEDC {1:1}` with `VERS {1:1}` and `FORM LINEAGE-LINKED {1:1}`, and `CHAR {1:1}`;
  - optional: `LANG <LANGUAGE_OF_TEXT>` (a name from the p. 51 list, such as `Finnish`).
- **Language mapping:** FHISO publishes a 5.5.1-name ↔ BCP 47 table (`Finnish` → `fi`), which the editors' C converter uses ([languages.tsv](https://github.com/fhiso/legacy-format/blob/master/languages.tsv); [c-converter README](https://github.com/gedcom7code/c-converter)).
- **Multimedia (pp. 26, 37, 54):** `MULTIMEDIA_LINK` may be a pointer or embedded: `n OBJE` / `+1 FILE {1:M}` / `+2 FORM {1:1}` / `+1 TITL`. A source citation has `+1 <<MULTIMEDIA_LINK>> {0:M}` and `+1 <<NOTE_STRUCTURE>> {0:M}` (p. 39).
  - `MULTIMEDIA_FORMAT:= [ bmp | gif | jpg | ole | pcx | tif | wav ]`.
  - `MULTIMEDIA_FILE_REFERENCE:= {Size=1:30}` is "A complete local or remote file reference … Remote reference would include a network address". The sizes are "the minimum recommended field length within a database that is constrained to fixed length fields" (p. 41), so a longer URL is legal but may be cut by a reader with fixed fields.
  - `WHERE_WITHIN_SOURCE` (PAGE) is `{Size=1:248}`.
- **Converting 5.5.1 → 7:** FamilySearch's [Migrating v5.5.1 to v7.0](https://gedcom.io/migrate/) guide covers the reverse of what ticket 06 needs:
  - it maps `FORM` values (`jpeg` ↔ `image/jpeg`, `bmp`, `gif`, `tiff`, `wav`, …);
  - it turns non-pointer `OBJE` into an `OBJE` record ("Take care to convert the `TITL` tag correctly");
  - it turns `NOTE` records into `SNOTE`;
  - it maps `AFN`/`RIN`/`RFN` → `EXID`, `RELA` → `ROLE`, lower-case enums → upper case, and dual dates → `PHRASE`.

  The editors' converters are [c-converter](https://github.com/gedcom7code/c-converter) (Unlicense, last push 2023-03-03) and [java-converter](https://github.com/gedcom7code/java-converter) (Unlicense, 2022-11-01), plus the web [magikey converter](https://magikeygedcomconverter.azurewebsites.net/).

- **7 → 5.5.1:** I found no official guidance or tool for this direction.

## 4. Libraries

### gedcom7code/js-gedcom, in depth

- **Who maintains it.** All 38 commits are by Luther Tychonievich (first 2023-07-17, last 2024-02-01). The spec's contributors page names "Gordon Clarke, **FamilySearch**" and "Luther Tychonievich, **FHISO** and **University of Virginia**" as Managing Editors ([contributors](https://github.com/FamilySearch/GEDCOM/blob/main/specification/gedcom-5-contributors.md)).
  - The `gedcom7code` org shows no public members. Its other repos are by the same author and by Dave Thaler, who makes the current commits to the spec repo. Calling it "the spec editors' org" is therefore accurate in practice, but no page says so.
  - The org's repos: `js-gedcom`, `js-parser` (2021, superseded), `c-parser`, `c-converter`, `java-converter`, `test-files`, and `xto7` (FamilySearch GEDCOM X → 7, MIT, 2026-03-19) ([org](https://github.com/gedcom7code)).
- **License, packaging.**
  - MIT or Unlicense ("released under both").
  - There is no `package.json` and no npm package (the registry returns "Not found" for `js-gedcom`), and there are no tags or releases.
  - It is four ES modules with no dependencies: `gedcstruct.js`, `g7structure.js`, `g7lookups.js` and `g7datatypes.js`. The README says it "does not currently handle different character sets. It assumes you have correctly parsed bytes into a JavaScript string".
- **What it parses and writes.**
  - The tag layer (`GEDCStruct.fromString(text, config, logger)`, `toString(newline, maxlen, escapes)`) reads and writes both dialects through `g5ConfGEDC` (`len: 255`, tags ≤31 chars) and `g7ConfGEDC` (`len: -1`, i.e. no limit and no `CONC`).
  - The typed layer (`G7Dataset.fromGEDC(gedc, new G7Lookups(g7validation))`, `toGEDC()`, `toJSON`/`fromJSON`, `find`/`findOrCreate`) is GEDCOM 7 only.
  - It does nothing with GEDZIP and nothing with 5.5.1 typing.
- **Validation.**
  - Driven by the registry's `g7validation.json`. The README lists errors for out-of-place standard tags, cardinality, malformed payloads, enumeration membership and pointed-to type. It warns on undocumented, unregistered, aliased and relocated extensions, and on deprecations.
  - Not done: "Warn about not-recommended patterns", and `FilePath`, `TagDef` and `anyURI` payloads (observed as warnings).
- **Round trip.**
  - The README claims `maximal70.ged` → `fromString` → `toJSON` → `fromJSON` → `toString` gives back the same file. I confirmed the tag and typed round trips are line-identical on `maximal70.ged` (838 lines).
  - On `obje-1.ged`, `filename-1.ged`, `escapes.ged` and our sample, both layers **drop the xref of every record nobody points to**. `toString` writes `@ID@` only when something refers to the record (`if (this.#ref.length > 0)` in `gedcstruct.js`).
  - The typed layer also regroups records by type.
  - Output uses LF by default and no BOM.
- **CONT/CONC.**
  - CONT folding and unfolding is correct, including `@@` at the start of each CONT line.
  - The `CONC` wrapping for 5.5.1 is rough. It splits at exactly `maxlen` characters whether or not the split falls on a space. It leaves a debug `console.log(ipt)` in. Its guard `maxlen < pfx + 1` compares a number with a string. It doubles only a leading `@`, not every `@` as 5.5.1 requires.
- **Runtime.** Plain ESM that runs under Bun (tested 1.4.3) and in browsers. There are no TypeScript types.

### Other JS/TS packages

| Package                                                                      | Writes                 | GEDZIP         | License                  | Latest             | Notes                                                                                                                                                  |
| ---------------------------------------------------------------------------- | ---------------------- | -------------- | ------------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [@kleiobase/gedcom-converter](https://github.com/KleioBase/gedcom-converter) | 7.0.18, 5.5.1          | read and write | MIT                      | 0.5.1, 2026-09-25  | Zero dependencies, CLI, [fidelity matrix](https://github.com/KleioBase/gedcom-converter/blob/main/docs/fidelity-matrix.md). One maintainer org, 1 star |
| [@treeviz/gedcom-parser](https://github.com/idavidka/gedcom-parser)          | 7.0, 5.5.1             | yes (jszip)    | MIT                      | 2.1.30, 2026-10-21 | Depends on lodash-es, date-fns, jszip; adds `_ORIGHEAD`. Not run                                                                                       |
| [gedcom-ts](https://www.npmjs.com/package/gedcom-ts)                         | `.ged`, GEDZIP         | yes            | "SEE LICENSE IN LICENSE" | 2026.9.0           | Browser-only ("DOM polyfills are required"), no public repo. Not run                                                                                   |
| [gedcomkit](https://gitlab.com/timrs2998/gedcomkit)                          | 5.5–7.x                | —              | GPL-3.0-or-later         | 0.1.19, 2026-10-17 | Rust/WASM, "byte-preserving round-trip". GPL rules out bundling. Not run                                                                               |
| [@domorium/validator](https://github.com/lavich/domorium)                    | — (parse and validate) | —              | MIT                      | 2.0.1, 2026-09-01  | Run above                                                                                                                                              |

Older parsers (`parse-gedcom`, `read-gedcom`, `gedcom`) only read, and none of them targets GEDCOM 7 ([npm search](https://www.npmjs.com/search?q=gedcom)).

What I saw running **@kleiobase/gedcom-converter 0.5.1** under Bun on the export-shaped sample:

- **`convert --to 5.5.1`:**
  - Correct: it wrote `HEAD.SOUR`, `SUBM @SUBM1@` with a `SUBM` record, `GEDC.FORM LINEAGE-LINKED`, `CHAR UTF-8`, `_UID` as-is, `FORM jpg`, and `CONC` split between non-spaces.
  - Wrong: lines of exactly 255 characters **before** the terminator, so 1–2 over 5.5.1's limit. `LANG fi` was left unmapped. A CONT line `@@alkaa…` became `Text: @alkaa…`, which changes the text. `CROP` became a third citation `NOTE Crop: top …`. Output is LF with no BOM.
  - The fidelity matrix documents the `UID` → `_UID` and `CROP` → note paths.
- **`validate`:** it reported "valid 7.0.18" for a file with duplicate `SEX`, duplicate `PAGE`, a `SOUR` pointing at an `INDI` and a `FILE` without `FORM`. It only found `CONC`.
- **`stringifyGedcomZip`:**
  - It wrote the zip entry unescaped (`media/kuva äiti.jpg` for `FILE media/kuva%20äiti.jpg`), which is correct.
  - It left general-purpose bit 11 unset, which is wrong: `unzip` shows a garbled name.
  - It still reported `GEDZIP_FILE_MISSING` for that same file.

### Non-JS references that can serve as a second reader

- **[python-gedcom7](https://github.com/DavidMStraub/python-gedcom7)** (MIT, v1.2.0 of 2026-10-01, Python ≥3.10). It reads and writes "based on regular expressions generated directly from the ABNF grammar", targets 7.0.18, "does not attempt to parse files that are not standards compliant, and raises rather than writing malformed lines". It has `gedcom7.validate`. Not run here: the system Python is 3.9, and pip resolved an old 0.4.1 without `load`.
- **[gramps-gedcom7](https://github.com/DavidMStraub/gramps-gedcom7)** (MIT, v0.4.1 of 2026-10-05). It provides GEDCOM 7 import and export for Gramps ≥6.0. "Every test file survives a round trip unchanged". The export "validates the dataset before writing". It is a full second application that could read our `.ged` and write it back.
- **[ArmidaleSoftware/gedcom7](https://github.com/ArmidaleSoftware/gedcom7)**: covered in section 1.

## 5. MyHeritage's GEDCOM upload

From MyHeritage's help centre (all articles dated 2026-07-21):

- **How to upload** ([article](https://www.myheritage.com/help/en/articles/12852096-how-do-i-upload-import-a-gedcom-file-to-my-family-site-on-myheritage)): "Move your mouse cursor on the 'Family Tree' tab and select 'Import GEDCOM'", then "Click on 'Upload'". "Depending on the size of the file, it may take a few minutes to upload". There is an email "when the tree is ready". The upload makes a new tree on the family site.
- **Photos** ([article](https://www.myheritage.com/help/en/articles/12851303-do-my-photos-transfer-with-a-gedcom-file)): "A GEDCOM file is a text file, that doesn't include the actual photos but it may contain the links to the photos original location", and "MyHeritage is able to import any GEDCOM file with links for the photos." On Ancestry imports: "We attempt to retrieve your photos during the upload process". So MyHeritage downloads media named by remote `FILE` URLs while uploading.
- **Export** ([article](https://www.myheritage.com/help/en/articles/12851866-how-do-i-download-export-a-gedcom-file-of-my-family-tree-from-my-family-site)): "you can choose whether to include photos to the GEDCOM file". A GEDCOM "also doesn't contain information that is exclusive to MyHeritage such as links to Smart Matches and Record Matches" ([What is a GEDCOM file?](https://www.myheritage.com/help/en/articles/12852476-what-is-a-gedcom-file)).
- **Not documented** on any MyHeritage page I found (the 9 articles in [Importing, Exporting & Merging Trees](https://www.myheritage.com/help/en/collections/17641788-importing-exporting-merging-trees) and the two Family Tree Builder GEDCOM articles):
  - which GEDCOM versions are accepted (5.5, 5.5.1, 7.0);
  - whether a `.gdz` or a zip with media is accepted;
  - any file-size limit;
  - whether `_UID` or anything else is used to match people, either on a re-upload or against an existing tree.

  Web searches turned up only forum posts, which are not used here.

- **Context, not evidence of support.** A MyHeritage person (Uri Gonen) sat on the GEDCOM 7 taskforce ([contributors](https://github.com/FamilySearch/GEDCOM/blob/main/specification/gedcom-5-contributors.md)). A FamilySearch RootsTech 2024 handout lists MyHeritage among "MAJOR WEBSITES" that "contributed to the groundswell" ([handout](https://cms-z-assets.familysearch.org/c6/51/e789d5572078f81d16a63a97cc80/rt24gedcom7popularityhandouts.pdf)). Neither says MyHeritage imports 7.0.
- **What MyHeritage writes** (from the app's own converter, not MyHeritage docs): its exports are 5.5.1 with `1 SOUR MYHERITAGE`, `_UID` on people, and 5.5-style embedded `OBJE` (`2 FORM jpg` beside `2 FILE https://…mhcache.com/…`), with URLs well over 30 characters (`src/server/myheritage.ts`, `src/server/import-dataset.test.ts`). The import drops `1 _UID` today (`DROP_TAGS`); ticket 02 changes that.

## What's reusable here

### 03: export a GEDZIP

- **Reuse or run:**
  - Keep the app's own `GedNode` → text serializer. js-gedcom's drops unreferenced xrefs and reorders records. kleiobase has the defects above. Neither fits "stored order, with the stored xrefs".
  - Use **js-gedcom as a validator in the round-trip test**: `bun add -d github:gedcom7code/js-gedcom#9296068` plus a pinned copy of `g7validation.json`. Fail on any error from `GEDCStruct.fromString(…, g7ConfGEDC, err)` and `G7Dataset.fromGEDC(…)`. Ignore its `FilePath`/`anyURI` "does not understand datatype" warnings. One caveat: the pinned commit is 20 months old and not maintained. A failure on a file the newer validators accept might be js-gedcom's bug.
  - Add `maximal70.gdz` (Unlicense test material) as an import fixture. Its escaped non-ASCII `FILE` is the ticket's escaping case.
  - Check the real-data `.gdz` by hand with ArmidaleSoftware GedValidate. It confirms every local `FILE` is in the zip.
- **Confirmed by the spec:**
  - no `CONC`;
  - `CONT` for line breaks;
  - zip names unescaped and `FILE` payloads escaped;
  - uncompressed media is fine;
  - `gedcom.ged` at the root;
  - `media/` is the recommended prefix.
- **Sharpened:**
  - Each `CONT` line starting with `@` must be written `@@`, not only the first line. Leading and trailing spaces must be kept.
  - CRLF is allowed, but every line must use it. A BOM is a "should".
  - Write `GEDC` first.
  - `FILE` must escape at least space, `%`, `?`, `#` and non-URL characters. It must not contain `..`, a leading `/` or `\`, and never a `file:` URL. A media file named `gedcom.ged` must be renamed.
  - fflate already sets the zip UTF-8 name flag; keep it, since readers without the flag fall back to CP437.
- **Flag (affects 05 and the ADR):** the spec says xrefs "are not retained between data streams". Merging "by record id when there is no `UID`" is safe only while the same MyHeritage export keeps its ids, which no MyHeritage page promises. Writing a fresh RFC 9562 UUID as `UID` for people without one would make the next import of the app's own GEDZIP match by `UID`. That is a choice for the ADR, not a spec requirement. An existing `UID` must be written unchanged, "not even … letter case normalization".

### 04: Marks into citations

- **Confirmed:**
  - A citation's `OBJE` must be a pointer to an `OBJE` record.
  - `CROP` belongs on the link, so one record per Image can carry a different Box per citation.
  - A remote `https` `FILE` is allowed and is not packed into the GEDZIP.
  - Several `NOTE`s under a citation are allowed.
  - Putting the Astia address in `PAGE` is what FamilySearch's FAQ recommends.
- **Contradiction 1:**
  - **What the ticket says:** `FILE` = "the Image URL", `FORM image/jpeg`, with a pixel `CROP`.
  - **What the ADR says:** `page` becomes "the Astia Image's address", which in the app is `viewerUrl()`, an HTML viewer page.
  - **What the spec needs:** a `CROP` is valid only if `FILE` "refers to an external file with a defined pixel unit". `FILE` must therefore be the JPEG itself: `https://astia.narc.fi/uusiastia/ws/getFile.php?fileId=…&aineistoId=…`, which `imageBytes()` fetches and checks with `isJpeg`. The viewer URL stays in `PAGE`.
  - The Box must be in pixels of that full-size JPEG, not of the 250-px thumbnail. `LEFT + WIDTH` and `TOP + HEIGHT` must not exceed its size, or the file is in error. The exporter knows the size and can check this.
  - I did not request `getFile.php` from outside the app to see whether it needs headers.
- **Contradiction 2:**
  - **What the ADR says:** the link carries "the Image's pixel size", and "Importing that GEDZIP gives back the same dataset". The 04 round-trip test expects the `OBJE`, `CROP` and notes to "come back as the same columns".
  - **The problem:** GEDCOM 7 has no standard place for an image's width and height, so it can't come back from standard structures. Ticket 03's "No `SCHMA`" rules out an extension.
  - **The options:** a third `NOTE` (e.g. `Image size: W×H`), reading the size from the Scan cache on import, or allowing one documented extension. Ticket 04 has to choose one.
- **Sharpened:**
  - The `FILE` URL carries the Volume id and file id, but not the Image number. Import must re-derive the number from the Volume's list.
  - Only the unchecked-vision note marks provenance in the GEDZIP. If the "hand or vision" column must survive for confirmed vision matches, it needs a note too.

### 06: export for MyHeritage

- **Reuse or run:**
  - Use the [migration guide](https://gedcom.io/migrate/)'s `FORM` table in reverse (`image/jpeg` → `jpg`) and FHISO's `languages.tsv` for `LANG` (`fi` → `Finnish`).
  - kleiobase's [fidelity matrix](https://github.com/KleioBase/gedcom-converter/blob/main/docs/fidelity-matrix.md) is a useful checklist of 7-only structures and what to do with each. Don't depend on the package.
  - In the 06 tests, run `@domorium/validator` on the 5.5.1 output. It finds missing `SOUR`/`SUBM` and bad `FORM` values. Assert line length and `LANG` yourself, since it checks neither.
- **What the ticket is missing:**
  - `HEAD.SOUR` and `HEAD.SUBM` are required, plus a `0 @…@ SUBM` record with a `NAME`.
  - `HEAD.LANG` takes a 5.5.1 language name, not BCP 47.
  - The 255 limit **includes the terminator**: at most 253 characters before CRLF, counted in characters, not bytes or UTF-16 units. Don't split a surrogate pair.
  - `CONC` must split between two non-space characters.
  - Every `@` in a value is `@@` in strict 5.5.1. Whether MyHeritage decodes `@@` is unknown, so put an `@` in a note for the by-hand upload.
  - `FILE` and `PAGE` can't take `CONC`, so each URL must fit on one line. Astia URLs (~95 characters) do. They exceed 5.5.1's 30-character recommended field size, as MyHeritage's own photo URLs already do.
- **Flag for the by-hand check:**
  - MyHeritage says it fetches linked photos during upload. A citation `OBJE` whose `FILE` is the Astia JPEG may be pulled into the tree as a photo, even with no person or family `OBJE`. Note in the ticket what happens.
  - If MyHeritage imports scans unwanted, the 5.5.1 file could link the viewer URL instead (with no `CROP` there is no pixel rule to meet). Then `FORM` has no fitting 5.5.1 value.
- **Unverified, by MyHeritage's silence:** 7.0 or GEDZIP support, size limits, and `_UID` matching. Writing `_UID` costs nothing and matches what MyHeritage's own exports carry. Nothing says MyHeritage reads it on upload.
