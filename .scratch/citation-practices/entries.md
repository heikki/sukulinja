# Merkintä tietomallin keskiöön

Status: needs-triage — taken up in `.scratch/entries/spec.md` and ADR-0026 (draft, 2026-11-13)

Heikki, 2026-11-11: mitä muutoksia tietomalliin tarvitaan, ja pitääkö terminologiaa yhtenäistää. Jatkoa tiedostoille [fact-citations.md](fact-citations.md) ja [idea.md](idea.md): oikeaoppisesti kirkonkirjan merkintä on yksi todiste, ja monta faktaa monelta ihmiseltä viittaa siihen.

Luonnos, ei ADR. Tästä tulee ADR, kun suunta on sovittu.

## Ongelma nyt

Tietomallin yksikkö on `citations`-rivi: yksi henkilö × yksi merkintä. Merkinnällä ei ole omaa riviä. Siksi:

- **Box, Image ja Volume kopioidaan jokaiselle riville** (`link_volume_id`, `link_image`, `link_file_id`, `link_box_*`, `link_by`). Kun merkintää siteeraa viisi ihmistä, Box on viidesti. Markin ja Discardin täytyy kirjoittaa "every citation of the record".
- **"Saman merkinnän sitaatit" tunnistetaan MyHeritagen tunnisteilla**: Record number tai viitteen URL. Sovelluksessa tehdyillä sitaateilla ("New citation for…") tällaista yhteyttä ei ole, vaan jokainen on oma rivinsä omalla Box-kopiollaan.
- **Litterointi (`text`) on kopioitu jokaiselle riville**, ja konversio kirjoittaa sen jokaiselle erikseen.
- **Sitaatti ei voi tukea useaa faktaa** ilman, että koko rivi Boxeineen kopioidaan.

## Ehdotettu malli

Kolme käsitettä, kaksi taulua ja yksi sarake:

```
entries                       citations (nykyinen, kevenee)
  id                            id
  source_id  → sources          scope_type, scope_id   (person | fact | …)
  volume_id, volume             entry_id → entries     (NULL = ei merkintää)
  image, file_id                role                   (CHIL, FATH, MOTH, GODP, SPOU, …)
  box_left/top/width/height     original_page          (MyHeritagen URL, henkilökohtainen)
  event                         added_in_app
  transcription                 page, event, quality, data_date, text, sort_order
  transcribed_by                  (vain tuoduille viitteille, kuten nyt)
```

- **Entry (merkintä)** on se, mitä kirjassa lukee: yksi kohta yhdessä kuvassa, yksi Box, yksi litterointi ja tapahtuma, jonka merkintä kirjaa (CHR, MARR, BURI tai rippikirjan rivi). Siitä on vain yksi rivi, siteerasipa sitä kuinka moni tahansa.
- **Citation** on viittaus merkintään henkilön tai faktan alta. Henkilön alla se tarkoittaa "hän on tässä merkinnässä tässä roolissa", faktan alla "tämä merkintä tukee tätä faktaa". Yhteen merkintään voi viitata monta sitaattia.
- **Role** on henkilön rooli merkinnässä, ja se kuuluu sitaatille, ei merkinnälle, koska kastemerkinnässä lapsi, isä ja kummi ovat eri rooleissa.
- **Box on merkinnän, ei sitaatin.** Mark, Discard ja Boxin siirto koskevat yhtä riviä. Sanaa "every citation of the record" ei enää tarvita.
- **Litterointi on merkinnän.** `transcribed_by` kertoo, kuka sen teki (käsin tai MyHeritagen indeksistä konvertoitu), samalla tavalla kuin Provenance kertoo pineistä.

Tuotu, merkitsemätön Church-book reference pysyy kuten nyt: sitaatti ilman merkintää (`entry_id` NULL), linkki estimaattina. Se saa merkinnän vasta, kun se Markataan merkinnän tasolla. Silloin syntyy Entry, ja konversio (ADR-0016) on käytännössä "reference → Citation of an Entry".

### GEDCOM

GEDCOM 7:ssä ei ole merkintä-tietuetta, joten vienti litistää mallin:

- Jokainen Citation kirjoitetaan `SOUR @Volume@`-rakenteena omalle paikalleen (henkilö tai fakta). Siihen tulevat `PAGE` merkinnästä johdettuna (idea.md, kohta 1), `DATA`/`TEXT` litteroinnista, `EVEN` merkinnältä, `ROLE` sitaatilta ja `OBJE` + `CROP` merkinnän Boxista.
- Import kokoaa takaisin: sovelluksen sitaatit, joilla on sama lähde, sama Image ja sama `CROP`, ovat yksi merkintä. Round trip -testi (ADR-0013) varmistaa, että tämä palautuu samaksi.
- Toisissa ohjelmissa tiedosto näyttää tavalliselta GEDCOMilta: sama viite toistettuna jokaisen faktan alla. Se on GEDCOMin oma tapa.

### Mitä tämä ei vielä tee

- **Faktojen muokkaus** (luonti, korjaus, ristiriidan perustelu) on oma päätöksensä: Sukulinjasta tulee puun pääkopio (fact-citations.md). Päätetty 2026-11-11: ADR-0021 ja [fact-editing/spec.md](../fact-editing/spec.md). Merkintämalli ei vaadi sitä. Ilman sitä sitaatin voi liittää vain olemassa olevaan faktaan.
- **Vision-pass Match ja Volume- tai Image-tason Markit** ovat MyHeritage-viitteiden asioita. Ne pysyvät sitaatin `link_*`-sarakkeissa siihen asti, kunnes MyHeritage-kansio poistetaan.

## Ajoitus

Tämä on skeemamuutos (nyt 11). Erillinen työ ("Migrate database schema automatically") tuo järjestetyt migraatiot, joten skeemamuutos ei enää vaadi uudelleentuontia. Ajoitus ei siis enää riipu siitä.

**Suositus: tehdään merkintämalli MyHeritage-kansion poiston yhteydessä (ADR-0016) tai sen jälkeen.** Perusteet:

- `myheritage/`-kansio ryhmittelee "saman merkinnän sitaatit" Record numberilla ja kirjoittaa Markit, Matchit ja vision passin tulokset jokaiselle riville. Jos merkintämalli tehdään ennen poistoa, koko tämä koodi pitää kirjoittaa uudelleen `entries`-taululle, vaikka se on poistumassa.
- Ilman tätä uudelleenkirjoitusta Boxilla olisi välivaiheessa kaksi kotia (merkintä ja Match-sitaatti), ja juuri sellaista liimaamista projektin sääntö kieltää.

Jos merkintämalli halutaan aiemmin, siisti tapa on siirtää kaikki Boxit (käsin ja vision) merkinnöille migraatiolla ja kirjoittaa `myheritage/`-kansion Mark-, Match- ja Discard-polut merkinnöille. Se on tehtävissä, mutta se on iso työ koodiin, joka on poistumassa.

Ennen sitä voi tehdä ilman skeemamuutosta: luettavan PAGE-tekstin (idea.md, kohta 1) ja EVEN/ROLE-arvot sovelluksen sitaateille (fact-citations.md, askel D). Molemmat siirtyvät suoraan uuteen malliin.

## Terminologia

Kyllä, terminologiaa pitää yhtenäistää. Nykyinen sanasto on syntynyt MyHeritagen ehdoilla, ja samaa asiaa kutsutaan monella nimellä.

| Nyt                                                                       | Ongelma                                                     | Ehdotus                                                                                                                                        |
| ------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| "record" (citations of the record, Record pin, Record number, RecordView) | tarkoittaa sekä MyHeritagen tietuetta että kirjan merkintää | **Entry** = kohta kirjassa. **Record** jää vain MyHeritagen tietueelle (Record number, Record range) ja poistuu sen mukana.                    |
| "entry" (Precision: at the entry; Box: "where an entry is written")       | käytössä jo, mutta ei omana terminään                       | **Entry** omaksi glossaaritermikseen; Precisionin "entry" viittaa siihen.                                                                      |
| Citation = henkilö × merkintä                                             | merkintä ja viittaus samassa                                | **Citation** = viittaus Entryyn henkilön tai faktan alta.                                                                                      |
| text, "the record's transcription as plain lines"                         | litterointi ilman nimeä                                     | **Transcription** = merkinnän teksti sellaisenaan. Erotetaan sen tekijä (`transcribed_by`).                                                    |
| EVEN "Record" / ROLE "<id>" (MyHeritage)                                  | ei GEDCOMia                                                 | **Event** = tapahtuma, jonka Entry kirjaa (CHR, MARR, …). **Role** = henkilön rooli Entryssä.                                                  |
| paneelin "Events" / tietokannan `facts`                                   | sama asia kahdella nimellä                                  | **Fact** = puun väite (tapahtuma tai ominaisuus), eli johtopäätös. Paneelin otsikko voi pysyä "Events", mutta glossaariin Fact.                |
| Conversion: reference → "Citation of its Image"                           | Image on kuva, ei merkintä                                  | Conversion: Church-book reference → **Citation of an Entry**.                                                                                  |
| Box (Image) ja Box (Photo)                                                | sama sana, sama merkitys                                    | pysyy: Box on vain "missä". Entry on Imagelle sama kuin Tag Photolle: kuka/mitä ja missä. Tagin henkilöön liittyvä vastine on Citationin Role. |

Lisäksi glossaariin kaksi periaatetta yhdellä rivillä kumpikin:

- **Entry on todiste, Fact on johtopäätös.** Entryyn ei kirjata omia päätelmiä, ja Fact viittaa Entryihin.
- **Citation of an Entry ei ole Church-book reference** (kuten ADR-0016 jo sanoo app-sitaateista).

Sanaston yhtenäistäminen kannattaa tehdä glossaariin heti, ennen koodia, koska se ohjaa ADR:n kirjoittamista. Koodin nimet (`RecordView`, `recordOf`, "citations of the record") vaihtuvat skeemamuutoksen yhteydessä.

## Avoimet kysymykset

1. Tehdäänkö merkintämalli MyHeritage-kansion poiston yhteydessä (suositus), vai aiemmin, jolloin kansion Mark-, Match- ja Discard-polut kirjoitetaan merkinnöille?
2. Riittääkö Role ilman erillistä "persona"-käsitettä (merkinnän henkilö sellaisena kuin hänet on kirjattu, esim. "Lovisa Johdr. Wäisänen")? Suositus: riittää. Nimi kirjoitusasussaan on jo litteroinnissa.
3. Glossaarin päivitys nyt: lisätäänkö Entry, Transcription, Event, Role ja Fact Citations-kontekstiin heti, vai vasta ADR:n kanssa?
