Status: needs-triage

# Sitaatin toisto ja uudelleenkäyttö muualla

Heikki, 2026-11-13: selvitys muiden käytännöistä sitaattien toistoon. Tausta: ADR-0022:n vienti toistaa sitaatin jokaisen tuetun faktan alla, koska GEDCOM 7:ssä sitaatilla ei ole omaa tietuetta.

Selvitys, ei päätös.

## GEDCOM 7 ja sen jatko

- **GEDCOM 7.0:ssa sitaatti (`SOURCE_CITATION`) on aina rakenne jonkin alla**, eikä sillä ole tunnistetta. Toisto jokaisen tuetun faktan alla on standardin oma tapa.
- **Ongelma on tunnettu ja auki.** FamilySearch/GEDCOM [#348](https://github.com/FamilySearch/GEDCOM/issues/348) (2023) ehdottaa level 0 -tietuetta `0 @C1@ CITA` ja faktan alle pelkkää osoitinta `2 CITA @C1@`. Perusteluna on juuri kirkonkirjan vihkimerkintä: 6+ henkilöä, sama litterointi "20 or more copies", ja virheellisen lukutavan korjaus jokaiseen kopioon erikseen.
- **Steering committee** (tychonievich) kertoi, että citations-työryhmä kallistuu "one type of record only which embodies both of these ideas", eli yhteen tietuetyyppiin, joka on sekä lähde että sitaatti. Molemmat mallit "can be implemented in v7.1". Norwegian-Sardines: "Changing the way citations are done in GEDCOM has not been dropped", mutta suurin osa muutoksista "must be done in v8.0". Päätöstä ei vielä ole. Työryhmän esimerkkilaajennus on [dthaler/gedcom-citations](https://github.com/dthaler/gedcom-citations) (sama asia sen issuena [#11](https://github.com/dthaler/gedcom-citations/issues/11)).
- **Samassa keskustelussa fisharebest (webtrees) ja tychonievich ehdottivat GEDCOM 7:n sisällä toimivaa ratkaisua:** jokainen rekisterimerkintä on oma lähdetietueensa (`0 @S1@ SOUR`), ja litterointi on lähteen `TEXT`. Sitaatit ovat silloin pelkkiä osoittimia (`SOUR @S1@` + `PAGE`/`ROLE`), joten mitään ei toisteta.
- Muita avoimia ehdotuksia: [#806](https://github.com/FamilySearch/GEDCOM/issues/806) (GEDCOM 8 -luonnos, jossa sitaatit asuvat yhdessä `TRACE`-tietueessa, yksi per asiakirja), [#784](https://github.com/FamilySearch/GEDCOM/issues/784) (siviili- ja seurakuntarekisterien merkinnät omana rakenteenaan) ja [#751](https://github.com/FamilySearch/GEDCOM/issues/751) (jaetut tapahtumat omina tietueinaan; TMG, RootsMagic ja Family Historian tekevät sen jo laajennuksilla).

## Ohjelmat

- **Gramps:** Citation on oma, jaettu objekti omalla tunnisteellaan. Se osoittaa yhteen lähteeseen, ja sitä voi käyttää monesta tapahtumasta ja henkilöstä. Gramps-käyttäjät ([foorumi](https://gramps.discourse.group/t/best-way-to-use-citation-of-a-same-event-on-individual-profiles/8640)) myös jakavat itse tapahtuman: lapsen kaste on yksi Event, ja siihen liitetään kummit roolilla Godparent. GEDCOM-viennissä jaettu sitaatti kirjoitetaan omaan tietooni perustuen toistettuna jokaisen viittaajan alle, koska muuta muotoa ei ole. Tätä en varmistanut Grampsin dokumentaatiosta.
- **RootsMagic, Legacy, Family Tree Maker:** "master source" (kirja) ja "citation detail" (kohta). RootsMagic 8+ ja FTM jakavat saman citationin monelle faktalle sisäisesti. GEDCOM-vienti toistaa sen samalla tavalla (Seaver, [Genea-Musings](https://www.geneamusings.com/2011/01/source-citation-dilemma-in-legacy.html); hänen kokemuksensa mukaan sitaattien siirto ohjelmasta toiseen on GEDCOMin heikoin kohta).
- **GEDCOM X (FamilySearch):** erottaa lähteen kuvauksen (SourceDescription), asiakirjasta poimitun henkilön (persona, record extraction) ja johtopäätöspuun (conclusion person). Tuki on viittaus SourceDescriptioniin. Rakenne on lähellä meidän merkintämalliamme.

## Lumping vs. splitting (Evidence Explained)

Omasta tiedostani, ei haettu tähän: Mills erottaa kaksi tapaa. **Lumping** tarkoittaa, että lähde on kokonainen julkaisu tai kirja, ja sitaatti kertoo kohdan. **Splitting** tarkoittaa, että jokainen asiakirja tai merkintä on oma lähteensä. Kumpikaan ei ole väärin. Ohjelmissa lumping pitää lähdeluettelon lyhyenä, ja splitting pitää merkinnän tiedot yhdessä paikassa.

## Mitä tämä tarkoittaa meille

- **Nykyinen vienti (ADR-0022) on GEDCOM 7.0:n mukainen ja sama kuin muilla ohjelmilla.** Sisäisesti emme toista mitään: sitaatti on yksi rivi ja tuki on oma rivinsä. Tämä vastaa Grampsin ja RootsMagicin mallia.
- **Merkintämallin ([entries.md](entries.md)) suunta on sama kuin standardin kehityksen:** merkintä yhtenä tietueena, ja ihmiset ja faktat viittaavat siihen. Se vastaa GEDCOM X:n personaa, #806:n `TRACE`a ja #348:n `CITA`a.
- **Kun merkintämalli tehdään, viennissä on kaksi vaihtoehtoa:**
  1. **Splitting nykyisellä GEDCOM 7:llä:** jokainen merkintä on `0 @E1@ SOUR`, jonka `TEXT` on litterointi ja `OBJE`/`CROP` kuva. Kirja on sen lähde, `SOUR.SOUR`-tai `REPO`-ketjuna. Sitaatit ovat osoittimia ja roolit. Ei toistoa, mutta lähteitä on tuhansia (fisharebestin ja tychonievichin ehdotus).
  2. **Lumping kuten nyt:** kirja on lähde, ja merkinnän tiedot toistetaan sitaateissa.

  Molemmista voi tuoda takaisin saman mallin. Valinta kannattaa tehdä merkintämallin ADR:ssä. Jos GEDCOM 7.1 tuo `CITA`-tietueen, vienti siirtyy siihen.

- **Nyt ei kannata tehdä mitään:** 7.1:n muoto ei ole päätetty, ja oma laajennus (`_CITA`) ei toimisi missään muussa ohjelmassa.
