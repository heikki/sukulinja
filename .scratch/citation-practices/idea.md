# Sitaattien hyvät käytännöt

Status: needs-triage

Heikki, 2026-11-11: "tutki best practices tämmöiseen sukututkimusjuttuun, eli vaikka, että mitä sitaatteihin pitäisi kirjata ja niin edelleen."

Idea, ei vielä spec. Vertaa vakiintuneita käytäntöjä (Evidence Explained, Genealogical Proof Standard, GEDCOM 7, Kansallisarkiston ja suomalaisten sukututkijoiden tavat) siihen, mitä Sukulinja tallentaa nyt, ja ehdottaa mitä kannattaisi ottaa käyttöön.

## Käsitteet, joihin alan käytännöt nojaavat

Elizabeth Shown Millsin _Evidence Explained_ ja BCG:n _Genealogy Standards_ erottavat kolme asiaa, jotka arkikielessä menevät sekaisin:

- **Lähde** (source): itse aineisto, esim. Astian Volume. Arvioidaan: **alkuperäinen** (Astian skannaus alkuperäisestä kirjasta), **johdettu** (HisKi, MyHeritagen/FamilySearchin indeksi, puhtaaksikirjoitettu rippikirja, joka kopioi kastetietoja), vai **tutkimus** (toisen sukututkijan puu).
- **Tieto** (information): mitä lähde sanoo. **Ensikäden** (primary: kirjaaja oli paikalla, esim. kastepäivä kastettujen luettelossa) vai **toisen käden** (secondary: syntymäaika rippikirjassa vuosikymmeniä myöhemmin).
- **Todiste** (evidence): miten tieto vastaa kysymykseen. **Suora**, **epäsuora** (päätellään yhdistämällä) vai **negatiivinen** (jonkin puuttuminen kertoo jotain).

**Genealogical Proof Standard** (GPS) vaatii johtopäätökseltä viisi asiaa: kattava haku, täydelliset ja tarkat sitaatit, lähteiden ja tietojen analyysi, ristiriitojen ratkaisu ja kirjoitettu perustelu. Sitaatin tehtävä on, että kuka tahansa (myös tuleva itse) löytää saman kohdan uudelleen ja näkee, kuinka paljon siihen voi luottaa.

## Mitä sitaatin pitäisi kertoa

Evidence Explainedin "who, what, when, where in, where is" -malli, sovitettuna kirkonkirjoihin:

| Osa               | Kirkonkirjassa                                                     | Sukulinjassa nyt                                                                                     |
| ----------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Kuka loi          | seurakunta, arkistonmuodostaja ("Haukivuoren seurakunnan arkisto") | Parish-tieto on, mutta app-sitaatin lähteen otsikko on pelkkä Volumen nimi, ilman seurakuntaa        |
| Mikä              | kirjan sarja ja signum ("I Aa:5 Pää- ja rippikirjat")              | on (Volumen nimi)                                                                                    |
| Milloin           | kirjan vuodet; merkinnän päivä                                     | kirjan vuodet nimessä; merkinnän päivää ei erikseen                                                  |
| Missä kohtaa      | sivu kirjassa, kuva Astiassa, kohta kuvassa                        | Image, Box ja Page number tallessa; PAGE on pelkkä Astian viewer-URL                                 |
| Missä aineisto on | Kansallisarkisto, Astia + pysyvä linkki                            | julkaisija "Kansallisarkisto, Astia", URL                                                            |
| Milloin katsottu  | viittauspäivä ("viitattu 11.11.2026")                              | Change-lokissa on päivä, sitaatissa ei                                                               |
| Mitä siinä lukee  | litterointi alkuperäisellä kielellä ja kirjoitusasulla             | TEXT on MyHeritagen litterointi tai tyhjä                                                            |
| Kuinka luotettava | lähteen ja tiedon laatu, oma arvio                                 | Certainty kertoo linkin varmuuden, ei tiedon laatua; `quality`-sarake on olemassa, mutta käyttämätön |
| Mitä se todistaa  | mihin tapahtumaan/faktaan sitaatti liittyy, ja kenen rooli         | app-sitaatti on aina henkilötasolla, ei faktalla; EVEN/ROLE tyhjiä                                   |

Suomalainen tapa kirjoittaa kirkonkirjaviite (Kansallisarkiston ja yliopistojen viittausohjeiden mukaan, sukututkimuksessa vakiintunut):

> Haukivuoren seurakunnan arkisto, I Aa:5 Pää- ja rippikirjat 1790–1796, s. 123. Kansallisarkisto, Astia, kuva 45. https://astia.narc.fi/… (viitattu 11.11.2026).

Järjestys yleisestä yksityiseen: arkisto → sarja ja signum → sivu → säilyttäjä ja palvelu → kuva ja linkki → päivä.

## Suositukset

Järjestetty hyödyn ja vaivan suhteen. Jokainen noudattaa nykyistä sääntöä: nimet johdetaan Astiasta, ei vapaata tekstiä.

### 1. Luettava sitaattiteksti johdettuna (pieni, suositeltava ensin)

App-sitaatin PAGE on nyt pelkkä URL. Muodosta PAGE yllä olevan mallin mukaan jo tallessa olevista kentistä (Parishin arkisto, Volumen nimi, Page number, Image, URL). Se ei ole uutta tallennettavaa, vain johdettu esitys, joten sen voi tehdä vientiin ja paneeliin ilman skeemamuutosta. GEDZIP- ja 5.5.1-vienti hyötyvät eniten: muut ohjelmat (ja MyHeritage) näyttävät nyt pelkän linkin.

Samalla kannattaa katsoa lähteen otsikkoa: Volumen nimi ilman seurakuntaa ("I Aa:5 Pää- ja rippikirjat (1790-1796)") on samanlainen monessa seurakunnassa. Lisäksi `volumeSource` etsii lähdettä varalla otsikolla ja julkaisijalla, joten kahden seurakunnan samanniminen Volume näyttää voivan päätyä samaan lähteeseen. Tämä kannattaa tarkistaa testillä erikseen.

### 2. Litterointi ja sen alkuperä (pieni–keskikokoinen)

Hyvä käytäntö: kirjoita merkintä sellaisenaan (ruotsi, latina, lyhenteet avaamatta, epäselvä `[?]`, omat lisäykset hakasulkuihin) ja erikseen tiivistelmä tai käännös. Nyt TEXT on konversiossa MyHeritagen/FamilySearchin vapaaehtoisten litterointi, joka on johdettua tietoa. Kun Box piirretään itse, olisi luonteva tallentaa myös oma lukema. Ehdotus: litteroinnille tieto siitä, kuka sen teki (oma / MyHeritage-indeksi), samaan tapaan kuin Provenance pineille. Tämä on skeemakysymys, ja sopii samaan suunnitteluun kuin Photos-tagien säilyttäminen re-importissa.

### 3. Lähteen laji johdettuna, ei käsin (keskikokoinen)

Älä lisää käsin annettavaa tähtiluokitusta: GEDCOMin QUAY (0–3) on alan mielestä karkea, ja harva täyttää sitä johdonmukaisesti. Laatu on sen sijaan pääosin pääteltävissä:

- **Index reference** (MyHeritagen kaste-/vihkiindeksi, HisKi) = johdettu lähde → "tarkista alkuperäisestä".
- Astian Image, Marked at entry = alkuperäinen lähde.
- Kastettujen luettelo kastepäivälle = ensikäden tieto; rippikirjan syntymäaika = toisen käden.

Book-laji ja Certainty ovat jo tallessa, joten tämän voi näyttää paneelissa ja kirjoittaa vientiin QUAY:ksi johdettuna. Hyödyllisin seuraus: lista henkilöistä, joiden ainoa lähde on johdettu (indeksi), eli mistä kannattaa hakea alkuperäinen kuva. Se sopii Reminders- tai Church books -näkymän rinnalle.

### 4. Sitaatti faktalle, ei vain henkilölle (iso, vaatii ADR:n)

Alan perusperiaate: sitaatti tukee yhtä väitettä (syntymäaika, vanhemmat, vihkiminen), ei henkilöä yleisesti. GEDCOM tukee tätä (sitaatti faktan alla, `EVEN`/`ROLE`), ja `citations.scope_type` sallii jo `'fact'`-arvon, mutta paneeli ja Scan viewer käsittelevät vain henkilötason sitaatteja. Tämä muuttaisi Scan viewerin "New citation for…"-kulkua (henkilön lisäksi valitaan tapahtuma ja rooli: lapsi, isä, kummi), paneelin Sources-osion ja re-importin parituksen. Tätä ei pidä liimata päälle: se kannattaa suunnitella omana featurenaan ja ADR:nä ennen koodia. Välivaihe, joka ei sulje mitään pois: tallenna app-sitaatille `EVEN` (BIRT/CHR/MARR/DEAT/rippikirjan läsnäolo) ja `ROLE` jo nyt, vaikka sitaatti pysyisi henkilötasolla.

### 5. Negatiiviset tulokset ja tutkimusloki (keskikokoinen)

GPS:n "kattava haku" tarkoittaa, että myös tyhjät haut kirjataan: "Kävin läpi Haukivuoren kastetut 1790–1800, ei merkintää". Nyt Reminder kattaa "palaa tähän", mutta ei "etsitty, ei löytynyt". Ehdotus: Reminderin tai Changen rinnalle "Searched"-merkintä Volumelle (ja vuosiväli tai Image-väli), henkilöstä ja kysymyksestä. Se myös estää käymästä samaa kirjaa läpi kahdesti.

### 6. Ristiriidat ja perustelu (myöhemmin)

Kun kaksi lähdettä antaa eri syntymäajan, GPS vaatii kirjoitetun ratkaisun. GEDCOMissa tämä on faktan NOTE. Riippuu kohdasta 4: kun sitaatit ovat faktoilla, faktan rinnalle voi näyttää kaikki sitä tukevat ja sen kanssa ristiriitaiset sitaatit, ja muistiinpanon perustelulle.

### 7. Viittauspäivä ja filmaus (pieni)

Astia vaihtaa skannauksia (Re-scan), ja sovellus tunnistaa sen jo file id:stä. Vientiin kannattaa kirjoittaa sitaatin tekopäivä (GEDCOM 7: `DATA`/`DATE` on merkinnän päivä, joten viittauspäivä NOTEen tai osaksi PAGE-tekstiä, "viitattu …"). Change-lokissa päivä on jo.

## Suomalaiset lähteet

- **HisKi** (Suomen Sukuhistoriallinen Yhdistys): kastettujen, vihittyjen ja haudattujen indeksi. Johdettu lähde, jossa on virheitä ja aukkoja. Hyvä hakemistona, sitaatti silti kuvaan. Jos HisKi-linkki tulee viitteeksi, se on samaa lajia kuin Index reference: sen kautta löytyy päivä ja nimet, ei sivua.
- **SSHY:n digiarkisto**: samat kirjat osin toisina kuvauksina, ja myöhempiä vuosia, joita Astiassa ei ole (seurakunnissa säilyneet kirjat). Jäsenmaksullinen. Sama Volume voi olla kummassakin, eri kuvanumeroinnilla, kuten MyHeritagen Film. Jos SSHY tulee joskus mukaan, se on toinen säilyttäjä samalle Volumelle, ei uusi lähde.
- **Signumit**: Kansallisarkiston kirkonarkistoissa I Aa = rippikirjat, I Ab = lastenkirjat, I C = syntyneet ja kastetut, I E = vihityt, I F = kuolleet ja haudatut (seurakunnittain vaihtelee). Volumen nimi Astiasta sisältää signumin jo, joten sitä ei tarvitse tallentaa erikseen.
- **Yksityisyys**: alle 100 vuotta vanhoihin kirkonkirjoihin on käyttörajoituksia, ja elävien ihmisten tiedot ovat henkilötietoja. Viennissä (erityisesti MyHeritageen) kannattaa joskus olla valinta, joka piilottaa elävät henkilöt. Ei kiireellinen, mutta kuuluu käytäntöihin.

## Mitä Sukulinja tekee jo hyvin

- Sitaatti osoittaa kohtaan, ei vain kirjaan: Image ja Box ovat tarkempia kuin useimmat sukututkimusohjelmat.
- Certainty ja Provenance erottavat, kuka linkin sanoi (käsin, malli, arvio). Tämä on juuri sitä, mitä Evidence Explained vaatii lähteen arvioinnilta, ja harvinaista ohjelmissa.
- Match vaatii vahvistuksen ennen kuin siitä tulee sitaatti (ADR-0016).
- Alkuperäinen viite säilyy (`original_page`), joten sitaatin historia ei katoa.
- Re-scan tunnistetaan, eli vanhentunut linkki ei esitä olevansa voimassa.

## Ehdotettu järjestys

1. Luettava PAGE-teksti ja lähteen otsikko seurakunnan kanssa (johdettu, ei skeemamuutosta) + tarkistus lähteiden sekoittumisesta.
2. Lähteen laji johdettuna paneeliin ja QUAY vientiin; lista henkilöistä, joilla on vain indeksilähde.
3. EVEN ja ROLE app-sitaateille.
4. Litteroinnin alkuperä (skeemamuutos).
5. Sitaatit faktoille, omana featurenaan ja ADR:nä; ristiriidat ja perustelut sen päälle.
6. "Etsitty, ei löytynyt" -merkinnät.

## Lähteitä

- Elizabeth Shown Mills, _Evidence Explained_ (3. p. 2015) ja _QuickSheet: The Historian's Source Analysis Process Map_.
- Board for Certification of Genealogists, _Genealogy Standards_ (2. p. 2019); GPS-tiivistelmä esim. https://books.byui.edu/docx/12240
- FamilySearch GEDCOM 7.0 -spesifikaatio: SOURCE_CITATION (`PAGE`, `DATA`/`DATE`/`TEXT`, `EVEN`/`ROLE`, `QUAY`).
- Kansallisarkisto, aineisto-oppaat: https://portti.kansallisarkisto.fi/fi/aineisto-oppaat/evankelis-luterilaiset-seurakunnat ja https://portti.kansallisarkisto.fi/fi/aineisto-oppaat/sukututkimuksen-perusl%C3%A4hteit%C3%A4
- Helsingin yliopiston historian viittausohjeet (arkistolähteet): https://studies.helsinki.fi/system/files/inline-files/2025_viittausohjeet_historia.pdf
