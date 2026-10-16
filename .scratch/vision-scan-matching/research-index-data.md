# Research: church-book index data for placing baptism and marriage citations

Researched 2026-10-16. Example Volume throughout: Pieksämäki I C:4, Astia id `1226129036`, 264 Images.

## Summary

No source gives the exact Astia Image of a single baptism or marriage entry. Two sources together come close, and both can be read today without keys:

- **Digihakemisto** has a volunteer index for the example Volume that labels every Astia Image with its register section and year, sometimes down to the months. Its image numbers match the app's Image numbers exactly (checked on all 264 Images by Astia file id). That answers "where do this register's dates run" outright: marriages, deaths, baptisms, migrations, each with its year span.
- **HisKi** has a full transcription of Pieksämäki baptisms (1674–1695, 1720–1884). Each entry has birth date, baptism date, village, parents and child, and a running number. That is ground truth for checking a date the vision model read, and for telling apart children of the same family. HisKi gives no page or image, but each record links to SSHY's per-year image lists.

Best lead: use Digihakemisto's section/year index to restrict the date search to the right section and year, then use HisKi to pick the exact entry and check the read. FamilySearch, the likely upstream of the MyHeritage index, is a dead end for automation. Its records carry no frame number, it was extracted from the 20th-century "black book" copies rather than the original Volumes, and its API and site terms exclude bulk use.

Neither Digihakemisto nor HisKi publishes an API, an export or terms for automated use. Before the app fetches either at scale, ask the operators.

## 1. FamilySearch: "Finland, Baptisms, 1657-1890"

**What it is**

- Collection 1778464. It is a Legacy collection: "no additional records will be added, or any corrections made". The page counts 4,555,893 records, 8,926,322 personas and 62,523 images. Its citation says "Index based upon data collected by the Genealogical Society of Utah" ([collection page](https://www.familysearch.org/search/collection/1778464)).
- The wiki lists the fields as child's name, gender, date and place of christening, date of birth and parents' names. It says the collection "may include information previously published in the International Genealogical Index", and that it "is not complete for any particular place" ([wiki](https://www.familysearch.org/en/wiki/Finland,_Baptisms_-_FamilySearch_Historical_Records)). No field gives a page, frame or image.
- A FamilySearch-hosted presentation explains the origin. Names were extracted from birth and christening records in the 1970s–1980s, covering about 95% of Lutheran parishes and children christened before about 1860 (to 1879 in south-east Finland). Parents' names are often abbreviated because the scribes of the "Black Books" abbreviated them. The Black Books are handwritten copies of the registers made in the 1920s and 1940s, which are "also the basis of Hiski" ([slides, FamilySearch CMS](https://cms-b-assets.familysearch.org/df/22/7de6af882da3576cc80523211d6f/the-importance-of-name-extraction-in-finnish-family-history-and-temple-work-presentation-slides.pdf)).
- A marriages counterpart, "Finland, Marriages, 1682-1892", exists. Only a secondary listing ([Cyndi's List](https://www.cyndislist.com/finland/bmd/)) confirms this; the FamilySearch page was not checked.

**The citation's identifiers**

- _GS film number 55677._ HisKi's parish pages list the Black Book microfilms by film number ("Mustat kirjat → Rullafilmit"):
  - Rautalampi: film **55677** holds "Syntyneet I 1695-1800", and the books "also include HANKASALMI, PIEKSÄMÄKI and SUONENJOKI" ([HisKi Rautalampi](https://hiski.genealogia.fi/historia/mini-pgsql.php?srk=445&kieli=fi)).
  - Pieksämäki: its own baptisms I 1674–1800 are on film **55660**. Film 55677 holds only Pieksämäki entries for 1797–1801 and 1803–1807 that sit "in the Rautalampi III book" ([HisKi Pieksämäki](https://hiski.genealogia.fi/historia/mini-pgsql.php?srk=394&kieli=fi)).

  So the GS film number names the **Black Book copy** an entry was extracted from, not the original Volume, and no frame number goes with it. Inference, not verified: a 1760 Pieksämäki baptism cited with film 55677 was probably copied from the Rautalampi register, which shared these chapels. That record may then sit in a Rautalampi Volume, or among the "(Rautalambi)" pages inside Pieksämäki I C:4 (see section 3).

- _Batch "C45407-1"._ The collection search form has a "Batch Number" field and a "Film/Fiche/Image Group Number (DGS)" field ([collection page](https://www.familysearch.org/search/collection/1778464)). A batch is a unit of extraction work. Reading "C" as christening (and "M" as marriage) is a common convention, but I found no primary source for it. **Unverified.**
- _"Finland-ODM"_ ("Järjestelmälähde", system origin): I found no primary source for what ODM means. **Unverified.**
- _Viewability of film 55677:_ not verified. Catalog pages, including the "Kirkonkirjojen kopiot" Black Book copies entry ([catalog 190817](https://www.familysearch.org/en/search/catalog/190817)), return a sign-in screen, and the catalog JSON service returned HTTP 401.

**API and terms**

- Every request needs an OAuth access token ([getting started](https://developers.familysearch.org/main/docs/getting-started)). Production keys need acceptance into the Compatible Solution Program after business and engineering review. "Solutions may not be approved that simply copy data out of FamilySearch" ([app approval](https://developers.familysearch.org/main/docs/app-approval-considerations)).
- Record search exists at `/platform/records/personas`: at most 100 results per page, and only the first 5,000 are returned ([Record Persona Search](https://www.familysearch.org/en/developers/docs/api/records/Record_Persona_Search_resource)).
- Throttling is counted per user (per app key when no one is signed in) as processing time per window. Over the limit it returns HTTP 429 with Retry-After ([throttling](https://developers.familysearch.org/main/docs/throttling)).
- Site terms allow viewing and downloading "only for your personal, noncommercial use". Without written permission they forbid using software "to perform a bulk download, to scrape content" or to "harvest any information" ([terms](https://www.familysearch.org/en/legal/terms)).

**What it would give the app:** no Image location. Any list of entries would be the same Black Book extraction that MyHeritage already shows, and the API and terms rule out pulling it automatically. The one useful signal, the film number as a hint to which parish's copy an entry came from, is already in the MyHeritage citation text.

## 2. HisKi (hiski.genealogia.fi)

**What it contains**

- Baptisms, marriages, burials and migration lists per parish ([help](https://hiski.genealogia.fi/historia/fi/ohjeet.htm); [Society page](https://www.genealogia.fi/en/webservices/hiski/)).
- Volunteers enter it "straight from digitized original church records through a separate platform". The Society warns that errors may come from the clergy, from "the copying of the black books" or from data entry ([Society page](https://www.genealogia.fi/en/webservices/hiski/)). Which source a given parish and period was transcribed from is not stated per register. **Unverified for Pieksämäki 1744–1766.**
- Pieksämäki coverage: Kastetut 1674–1695 and 1720–1884; Vihityt 1721–1783, 1795–1850 and 1864–1904; Haudatut fragments ([parish page](https://hiski.genealogia.fi/hiski?fi+0394)).
- Fields of a baptism record: birth date, baptism date, village, farm, father, mother, child, plus "Oma komm." and "Alkup. komm." (the transcriber's comment and the original-text comment). Each record has a permanent id (`/hiski?fi+t<id>`) and a per-parish running number. The detail page lists the five neighbouring running numbers on each side ([sample record view](https://hiski.genealogia.fi/hiski?fi+0394+kastetut+8730)). **No page, entry number from the book, or image.**
- Observed order: running numbers 8725–8735 (Pieksämäki 1760) do not run in strict baptism-date order. They look like book order, with the register's own irregularities, but that is not documented. **Unverified.**
- Scan links: each record links to SSHY for that parish and year (`sukuhistoria.fi/sshy/sivut/HisKi-digiarkisto.php?plid=0394&year=1760`), which lists the SSHY image sets covering the year (see section 3). There are no links to Astia or Digihakemisto.
- Search: a POST form at `/hiski` with `komento=haku`, `srk`, `kirja`, `alkuvuosi` and `loppuvuosi` (dates as `p.k.vvvv`), name fields, and `maxkpl` (15–1000 in the form). The help page puts the ceiling at 750 per query ([shared fields help](https://hiski.genealogia.fi/historia/fi/ohjyht.htm)). Results are limited to events at least 100 years old ([help](https://hiski.genealogia.fi/historia/fi/ohjeet.htm)).

**What it would give the app:** a full list of a parish's baptisms (and marriages), with birth and baptism dates, usable:

- to check a date the vision model read against the real sequence of entries around it;
- to estimate the entry's position within its year;
- to separate siblings with similar names, because the parents, village and both dates are all there.

It would not give the Image directly.

**Access**

- No API, export or download is documented on the help pages or the Society page. No terms of use are stated.
- `robots.txt` has `Disallow: /hiski/`, and the search pages carry `<META NAME="ROBOTS" CONTENT="NOINDEX, NOFOLLOW">` and a Cloudflare challenge script (observed on [/hiski?fi+L4](https://hiski.genealogia.fi/hiski?fi+L4)).
- Treat automated querying as not permitted until the Society agrees. HisKi lists a feedback address on its help page.

## 3. Image indexes: Digihakemisto, SSHY, Astia

### Digihakemisto (digihakemisto.net)

**What it contains**

- A finding aid over Astia. At volume level it shows "the digitized images and any associated table of contents (hakemisto)" ([home](https://digihakemisto.net/)).
- The Society supports its upkeep ([home](https://digihakemisto.net/)). The index text is crowdsourced, and the blog warns that not all tables of contents moved to the 2022 version and that rescans can misalign indexes ([blog](https://digihakemisto.blogspot.com/)).
- The example Volume has a full index ([digihakemisto.net/aineisto/1226129036](https://digihakemisto.net/aineisto/1226129036), last changed 2026-09-27). Columns: _Jakso_ (image number), _Sivunumero_ (empty here) and _Kuvaus_ (description). Each row links `/item/1226129036/<Astia fileId>/<n>`.
- The rows map out the whole Volume:

  | Images  | Section                                     |
  | ------- | ------------------------------------------- |
  | 3–34    | Marriages ("Copulati" / "Wigda"), 1744–1766 |
  | 35–92   | Deaths ("DÖDE"), 1744–1766                  |
  | 93–256  | Baptisms ("FÖDDE" / "Döpta"), 1744–1766     |
  | 255–263 | Migration lists and a crime list            |
  | 264     | Blank                                       |

  Some baptism rows list the months on the page; for example, Image 186 is "1759 Döpta 3, 4, 5". Rautalampi pages inside the Volume are marked "(Rautalambi)" (Images 92, 115, 234).

- **Verified alignment.** All 264 Astia file ids from the app's own cache (`ws/aineisto/digitoidut.php?id=1226129036`) match Digihakemisto's Jakso 1–264 in order. Digihakemisto's image number is the app's Image number.

**What it would give the app:**

- each register section's Image range, and each Image's year (sometimes months), as ground truth for where the dates run;
- a way to skip the marriage and death sections in a baptism search;
- a check that the vision model's reads are plausible.

It gives no per-entry location. Coverage beyond this Volume is unknown, and a Volume may be indexed only partly or not at all.

**Access**

- No API, export or terms are published. Pages are server-rendered HTML.
- An HTTPS request with a browser user agent got 200. A request with curl's default user agent (for robots.txt) got 403 from nginx, so I could not read its robots.txt.
- The banner says the service "still has disruptions", and the blog announced a platform move in 2026-08. Ask the maintainer (feedback address on the site) before fetching per-Volume pages, or ask for an export.

### SSHY Digiarkisto (sukuhistoria.fi)

**What it contains**

- Image sets made from the National Archives microfilms, split by section. For Pieksämäki 1760 ([year page](http://www.sukuhistoria.fi/sshy/sivut/HisKi-digiarkisto.php?plid=0394&year=1760)):

  | Section                 | Images | Microfilm          |
  | ----------------------- | ------ | ------------------ |
  | syntyneet (births)      | 161    | TK1422-1423, I C:4 |
  | vihityt (marriages)     | 38     |                    |
  | kuolleet (deaths)       | 56     |                    |
  | muuttaneet (migrations) | 11     |                    |

- Each set has a per-image table with _Kuva_, _Sivu_ and _Kommentti_ columns. The comment column carries year annotations such as "1760", "1758-1759" and "välissä Rautalammilla 1749 kastetut" ("between, those baptised in Rautalampi 1749") ([births I C:4](http://www.sukuhistoria.fi/sshy/sivut/HisKi-digiarkisto.php?bid=12710)).
- Images open without sign-in for this set ([image 100](http://www.sukuhistoria.fi/sshy/sivut/HisKi-digiarkisto.php?bid=12710&pnum=100)). A FamilySearch presentation says newer material is for SSHY members (secondary; not checked on SSHY).

**What it would give the app:** a second year-per-image index, but in **SSHY's own numbering of a different digitisation** (microfilm, split by section). It does not map 1:1 to Astia Images. Useful only as a cross-check, or where Digihakemisto has no index.

**Access**

- `robots.txt` allows `/` for all agents with `Crawl-delay: 10`. It disallows the wiki and forum, including for ClaudeBot ([robots.txt](https://www.sukuhistoria.fi/robots.txt)).
- I found no terms of use for the image archive.

### Astia itself

- Astia's volume file list (`digitoidut.php`) gives each image only a file id and the title "Tiedosto N". Its `hakusana` field is empty for this Volume, as seen in the app's cache. I found no Astia-side table of contents for church-book Volumes. Not checked beyond this Volume.

## Recommended next steps

1. **Ask the Digihakemisto maintainer** for permission to read per-Volume index pages at a slow rate, or for an export, and for how indexes are kept aligned after Astia rescans.
2. **Measure coverage.** For the Volumes behind the 1,108 index citations, count how many have a Digihakemisto index with section/year descriptions. This decides whether a "section and year" lookup can replace the date search's first probes.
3. **Ask the Genealogical Society of Finland** whether HisKi data may be queried by a personal script, or obtained as an extract per parish and register, and under what terms. Until then, use HisKi only by hand.
4. **Prototype on I C:4.** Restrict the 1760 date search to the baptism section (Images 93–256), and to Images 192–199 ("1760"). Then check the found Image's entries against HisKi's 1760 list. Compare the result with the current binary search.
5. **Use the GS film number as a parish hint.** Map film numbers to parish Black Books from HisKi's parish pages, so a citation from a neighbouring parish's copy (e.g. 55677, Rautalampi) also searches the "(Rautalambi)" pages or that parish's Volume.
6. Drop FamilySearch as a data source. Its API approval rules and site terms rule out the use, and its index adds no location.

## Open questions

- Does the HisKi running number follow book order, and was Pieksämäki 1744–1766 transcribed from the original or from the Black Book?
- What do "ODM" and the "C" batch prefix mean in FamilySearch's data? (No primary source found.)
- Is film 55677 viewable on FamilySearch, and is a Pieksämäki 1760 baptism indexed from it written in the Pieksämäki Volume at all? (Catalog needs sign-in.)
- How complete and current are Digihakemisto indexes across the other Volumes, and do any of them fill the _Sivunumero_ (page) column?
- Does MyHeritage's collection match FamilySearch's 1:1? MyHeritage's collection page did not render when fetched, and a secondary listing gives a different record count.
