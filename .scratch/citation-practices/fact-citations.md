# Sitaatit faktoille

Status: needs-triage

Heikki, 2026-11-11: "tutki kohtaa 4 lisää" (idea.md, kohta 4: sitaatti faktalle, ei vain henkilölle).

Selvitys, ei vielä spec. Kertoo, mitä koodi ja Heikin data nyt tekevät, mitä GEDCOM tarkoittaa, mitkä ovat vaihtoehdot ja mikä on suositus. Avoimet kysymykset ovat lopussa.

## Mitä data ja koodi tekevät nyt

**Heikin dev-data (ylonen, 2026-11-11):**

- Kaikki 3 835 sitaattia ovat henkilöllä, eikä yksikään ole faktalla. Niistä 421 on tehty sovelluksessa.
- Henkilöillä on 5 139 faktaa (RESI 2 347, DEAT 1 168, BIRT 1 154, CHR 390, BURI 45, MARR 44 …), eikä millään niistä ole sitaattia.
- MyHeritage siis vie sitaatit aina henkilön alle. Sitaatin litterointi kertoo silti, mitä tapahtumia tietue tukee ("Syntymäpäivä: 15. Touko 1867", "Asuinpaikka: … 1867–1879").
- MyHeritage käyttää GEDCOMin `EVEN`/`ROLE`-kenttiä omaan tarkoitukseensa: `EVEN Record`, `ROLE 30233:548464-F:`, eli tietueen id roolikentässä. `QUAY` on aina 3. Kumpikaan ei siis kerro mitään, eikä sovellus lue niitä.

**Koodi:**

- **Import, vienti ja tietokanta** tukevat faktan sitaatteja jo täysin: `citations.scope_type = 'fact'`, `importCitations` faktan alla ja `citations('fact', f.id)` viennissä. Bourbon-demossa on neljä.
- **Re-importin merge** tukee jo sovelluksessa tehtyä sitaattia faktalla. `scopeIn`/`factIn` etsii uudesta viennistä saman henkilön faktan, jolla on sama tagi, päivämäärä ja paikka. Paritus (`pairUp`, `replacements`) nousee faktasta henkilöön `ownerFinder`in kautta, joten ADR-0016:n korvaussääntö toimii, vaikka sitaatti olisi faktalla.
- **Kaikki muu** on henkilötasoa: `citations.ts`:n kyselyt (`WHERE c.scope_type = 'person'`), eli paneelin Sources, Scan viewerin People-paneeli, Mark ja Discard ("every citation of the record") ja Church books -laskurit. Samoin `app-citations.ts`, joka luo sitaatin aina `scopeType: 'person'`. Paneelin Events-osio (`person-details.ts`) näyttää faktat ilman sitaatteja.
- **Sovellus ei muokkaa faktoja** (ADR-0013: puu tulee lähdeohjelmasta). Sitaatin voi siis liittää vain olemassa olevaan faktaan.

## Mitä GEDCOM tarkoittaa

GEDCOM 7:ssä on kaksi eri asiaa, jotka menevät helposti sekaisin:

1. **Missä sitaatti on**: `SOUR` faktan alla (`1 BIRT` / `2 SOUR @S1@`) sanoo, että lähde tukee tätä väitettä. Henkilön alla `SOUR` tukee henkilöä yleisesti, eli sitä, että hän on olemassa.
2. **`EVEN` ja `ROLE` sitaatin sisällä** kertovat, millaisesta tapahtumasta lähde kirjoittaa ja kenen roolissa henkilö siinä on: `EVEN CHR` / `ROLE FATH` = "kastemerkintä, jossa hän on isä". Tämä on tietoa tietueesta, ei puun faktasta. Isän kohdalla kastemerkintä ei ole hänen oma kasteensa, vaan se tukee esimerkiksi hänen asuinpaikkaansa ja vanhemmuuttaan.

Yksi kirkonkirjamerkintä tukee usein monta faktaa. Rippikirjan rivi antaa syntymäajan (toisen käden tieto), asuinpaikan vuosiksi ja usein vihkimisen ja kuoleman. GEDCOMin tapa on toistaa `SOUR` jokaisen tuetun faktan alla.

## Vaihtoehdot

**A. Sitaatti siirtyy faktalle, jota tietue koskee.** Yksi Citation tietuetta ja henkilöä kohden, kuten nyt, mutta `scope_type = 'fact'`: kastemerkintä lapsen CHR/BIRT-faktalle, rippikirjan rivi henkilön RESI-faktalle, jos sellainen on. Jos sopivaa faktaa ei ole, sitaatti jää henkilölle.
- Plussat: GEDCOM-natiivi, ei skeemamuutosta, ja merge tukee jo. Mark, Box ja Change koskevat edelleen yhtä Citationia.
- Miinukset: rippikirjan rivi tukee vain yhtä faktaa, vaikka antaa useamman tiedon. `factIn` hukkaa sitaatin, jos lähdeohjelmassa korjataan faktan päivää tai paikkaa, ja juuri sitä uusi sitaatti usein aiheuttaa.

**B. Kopio jokaisen tuetun faktan alle.** GEDCOMin puhdas tapa.
- Plussat: jokainen fakta näyttää kaikki lähteensä, ja ristiriidat näkyvät suoraan.
- Miinukset: monta riviä yhtä merkintää kohden. Kaikki, mikä nyt käsittelee "yhtä sitaattia" (Mark, Discard, Delete, Change, paneelin lista, Scan viewerin People), joutuisi ryhmittelemään kopiot. Tämä on iso refaktorointi läpi `citations/`-kansion.

**C. Sitaatti jää henkilölle, tuetut faktat johdetaan näyttöön.** Paneeli vertaa sitaatin litteroinnin päiviä ja paikkoja henkilön faktoihin ja näyttää sitaatin niiden faktojen alla, joihin se osuu. Mitään ei tallenneta.
- Plussat: ei tallenneta mitään turhaa, ei skeemaa eikä mergeä. Se toimisi heti kaikille 3 835 sitaatille ja näyttäisi ristiriidat (eri päivä samassa tapahtumassa).
- Miinukset: lukee MyHeritagen kenttiä (`myheritage/record.ts`), ja kansio on ADR-0016:n mukaan poistumassa. Scan viewerissä tehdyllä sitaatilla ei välttämättä ole litterointia. Vienti ei hyödy.

**D. Pelkät `EVEN`/`ROLE` sovelluksen sitaateille.** Sitaatti jää henkilölle, mutta kertoo mitä tietue on ja kenen roolissa (CHR/FATH).
- Plussat: johdettavissa (Book-laji: kastetut → CHR, vihityt → MARR, rippikirja → RESI tai CENS; Index referencen pääte: `-` lapsi, `-F` isä, `-M` äiti). Ei skeemamuutosta, ja kirjoittuu vientiin oikein.
- Miinukset: ei vielä kytke sitaattia puun faktaan.

## Suositus

**Ensin D, sitten A sovelluksen omille sitaateille. B ei kannata nyt, ja C vain väliaikaisena näkymänä, jos sitä tarvitaan.**

1. **D ensin.** Kun Citation tehdään sovelluksessa tai se konvertoidaan (ADR-0016), kirjoitetaan `EVEN` ja `ROLE` Book-lajista ja Index referencen päätteestä. Konversiossa ne korvaavat MyHeritagen `EVEN Record`-arvot, jotka eivät ole GEDCOMia. Scan viewerin "New citation for…" voi tarjota roolin (lapsi, isä, äiti, kummi, puoliso), jos sitä ei voi päätellä. Tämä on pieni ja tekee B:n ja A:n myöhemmin helpommiksi.
2. **Sitten A, vain sovelluksen omille sitaateille** (`added_in_app`). Lähdeohjelman tuomat sitaatit pysyvät siellä, minne se ne pani. Tämä noudattaa ADR-0013:a: tuotu osa tulee aina uudesta viennistä. Kastemerkintä menee lapsen CHR-faktalle (tai BIRT, jos CHR:ää ei ole), vihkimerkintä MARR-faktalle ja rippikirjan rivi RESI-faktalle, jonka vuodet osuvat kirjan vuosiin. Muuten sitaatti jää henkilölle. Valinta johdetaan EVEN-arvosta, eli käyttäjän ei tarvitse valita.
   - Vaatii: `citations.ts`:n kyselyt henkilöön nousevina (`scope_type = 'person'` → henkilö tai hänen faktansa), paneelin Events-osioon sitaatit faktojen alle, ja `factIn`-hakuun varasääntö: jos samaa faktaa ei löydy, saman tagin fakta, ja muuten henkilö, ettei sitaatti katoa re-importissa.
   - Tämä on rajapintamuutos `citations/`-kansioon ja mergeen, joten siitä kannattaa tehdä ADR ennen koodia (tämän projektin sääntö: ei liimata päälle).
3. **B ei nyt.** Kopiot vaatisivat "yhden tietueen sitaattiryhmän" käsitteen kaikkialle. Se kannattaa vasta, jos ristiriitojen näyttäminen faktoittain tulee oikeasti tarpeeseen, ja silloinkin luultavasti C:n tapaan johdettuna näkymänä eikä tallennettuina kopioina.

## Avoimet kysymykset Heikille

1. **Meneekö mitään takaisin MyHeritageen?** Jos 5.5.1-tiedosto ladataan MyHeritageen ja sieltä viedään taas, palaako faktan alle pantu `SOUR` faktan alla vai henkilön alla? Jos henkilön alla, ADR-0013:n Duplicates-sääntö pudottaa sovelluksen version, ja sijoitus faktalle katoaa joka kierroksella. Tämä pitää testata yhdellä henkilöllä ennen A:ta.
2. **Rippikirjan rivi: RESI vai ei mitään?** Datassa on 2 347 RESI-faktaa, oletettavasti MyHeritagen rippikirjasitaateista. Onko rippikirjamerkinnän luonteva koti asuinpaikka, vai pitäisikö sen jäädä henkilölle?
3. **Kummit.** Kastemerkintä kummin kohdalla (`ROLE` muu, `PHRASE Kummi`) ei tue mitään hänen faktoistaan. Jääkö sellainen henkilölle, ja tarvitaanko sitä ylipäätään?
