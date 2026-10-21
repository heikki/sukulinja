// A dataset as GEDCOM 7: every record and structure the database holds, in
// stored order, with the stored xrefs (ADR-0013). Importing what this
// writes gives the same dataset back.

import type { Database } from 'bun:sqlite';

import { mediaExport } from './export-media';
import { ownerKey, readExportRows } from './export-rows';
import type {
  CitationRow,
  FactRow,
  FamilyRow,
  NameRow,
  PersonRow,
  RepositoryRow,
  SharedNoteRow,
  SourceRow,
  SubmitterRow
} from './export-rows';
import { EVENTS } from './gedcom-tags';
import { line, optional, pointer, writeGedcom } from './gedcom-writer';
import type { OutLine } from './gedcom-writer';
import { enumeration, EVENT_TYPES, NAME_TYPES, ROLES } from './gedcom7-values';

// What a GEDCOM 7 citation gives when it names no source record.
const VOID = '@VOID@';

function changeOf(row: {
  change_date: string | null;
  change_time: string | null;
}) {
  if (row.change_date === null) return [];
  return [
    line('CHAN', null, [
      line('DATE', row.change_date, optional('TIME', row.change_time))
    ])
  ];
}

interface Enumeration {
  allowed: Set<string>;
  // What the line says when the value isn't in it, the value then its PHRASE.
  other: string;
}

const ROLE: Enumeration = { allowed: ROLES, other: 'OTHER' };
const EVENT: Enumeration = { allowed: EVENT_TYPES, other: 'EVEN' };
const NAME_TYPE: Enumeration = { allowed: NAME_TYPES, other: 'OTHER' };

function enumLine(
  tag: string,
  value: string,
  { allowed, other }: Enumeration,
  children: OutLine[] = []
) {
  const { payload, phrase } = enumeration(value, allowed, other);
  return line(tag, payload, [...optional('PHRASE', phrase), ...children]);
}

function xrefsById(rows: Array<{ id: number; xref: string }>) {
  return new Map(rows.map((r) => [r.id, r.xref]));
}

export function exportGedcom(db: Database) {
  const rows = readExportRows(db);
  const personXref = xrefsById(rows.persons);
  const familyXref = xrefsById(rows.families);
  const sourceXref = xrefsById(rows.sources);
  const repositoryXref = xrefsById(rows.repositories);
  const sharedNoteXref = xrefsById(rows.sharedNotes);
  const media = mediaExport(
    rows,
    new Set(
      [
        ...rows.persons,
        ...rows.families,
        ...rows.sources,
        ...rows.repositories,
        ...rows.sharedNotes,
        ...rows.submitters
      ].map((r) => r.xref)
    ),
    notes
  );

  function notes(ownerType: string, ownerId: number): OutLine[] {
    return rows
      .notesOf(ownerKey(ownerType, ownerId))
      .map((note) =>
        note.shared_note_id === null
          ? line('NOTE', note.text, citations('note', note.id))
          : pointer('SNOTE', sharedNoteXref.get(note.shared_note_id)!)
      );
  }

  function citationEvent(c: CitationRow) {
    if (c.event === null) return [];
    const role = c.role === null ? [] : [enumLine('ROLE', c.role, ROLE)];
    return [enumLine('EVEN', c.event, EVENT, role)];
  }

  function citationData(c: CitationRow) {
    if (c.data_date === null && c.text === null) return [];
    return [
      line('DATA', null, [
        ...optional('DATE', c.data_date),
        ...optional('TEXT', c.text)
      ])
    ];
  }

  function citations(scopeType: string, scopeId: number): OutLine[] {
    return rows
      .citationsOf(ownerKey(scopeType, scopeId))
      .map((c) =>
        pointer(
          'SOUR',
          c.source_id === null ? VOID : sourceXref.get(c.source_id)!,
          [
            ...optional('PAGE', c.page),
            ...citationData(c),
            ...citationEvent(c),
            ...optional('QUAY', c.quality === null ? null : String(c.quality)),
            ...media.linksOf('citation', c.id),
            ...notes('citation', c.id)
          ]
        )
      );
  }

  function address(ownerType: string, ownerId: number) {
    return rows
      .addressOf(ownerKey(ownerType, ownerId))
      .map((a) =>
        line('ADDR', a.text, [
          ...optional('ADR1', a.line1),
          ...optional('ADR2', a.line2),
          ...optional('ADR3', a.line3),
          ...optional('CITY', a.city),
          ...optional('STAE', a.state),
          ...optional('POST', a.postal_code),
          ...optional('CTRY', a.country)
        ])
      );
  }

  function place(f: FactRow) {
    const placeNotes = notes('place', f.id);
    const map =
      f.latitude === null && f.longitude === null
        ? []
        : [
            line('MAP', null, [
              ...optional('LATI', f.latitude),
              ...optional('LONG', f.longitude)
            ])
          ];
    if (f.place === null && map.length === 0 && placeNotes.length === 0) {
      return [];
    }
    return [line('PLAC', f.place, [...map, ...placeNotes])];
  }

  // An event with nothing left to say is still known to have happened.
  function fact(f: FactRow) {
    const details = [
      ...optional('TYPE', f.type),
      ...optional('DATE', f.date_text),
      ...place(f),
      ...address('fact', f.id),
      ...optional('AGNC', f.agency),
      ...optional('CAUS', f.cause),
      ...optional('AGE', f.age),
      ...notes('fact', f.id),
      ...citations('fact', f.id),
      ...media.linksOf('fact', f.id)
    ];
    const bare = f.value === null && details.length === 0;
    return line(f.tag, bare && EVENTS.has(f.tag) ? 'Y' : f.value, details);
  }

  function name(n: NameRow) {
    return line('NAME', n.full_text, [
      ...(n.name_type === null
        ? []
        : [enumLine('TYPE', n.name_type, NAME_TYPE)]),
      ...rows.piecesOf(String(n.id)).map((p) => line(p.tag, p.value)),
      ...notes('name', n.id),
      ...citations('name', n.id)
    ]);
  }

  function associations(personId: number) {
    return rows
      .associationsOf(String(personId))
      .map((a) =>
        pointer('ASSO', personXref.get(a.associate_id)!, [
          enumLine('ROLE', a.relation ?? 'OTHER', ROLE),
          ...notes('association', a.id)
        ])
      );
  }

  function person(p: PersonRow): OutLine {
    const key = String(p.id);
    return {
      tag: 'INDI',
      xref: p.xref,
      children: [
        ...rows.namesOf(key).map(name),
        ...optional('SEX', p.sex),
        ...rows.factsOf(ownerKey('person', p.id)).map(fact),
        ...rows
          .parentFamiliesOf(key)
          .map((c) => pointer('FAMC', familyXref.get(c.family_id)!)),
        ...rows
          .spouseFamiliesOf(key)
          .map((s) => pointer('FAMS', s.family.xref)),
        ...associations(p.id),
        ...optional('UID', p.uid),
        ...notes('person', p.id),
        ...citations('person', p.id),
        ...media.linksOf('person', p.id),
        ...changeOf(p)
      ]
    };
  }

  function partner(tag: string, id: number | null) {
    return id === null ? [] : [pointer(tag, personXref.get(id)!)];
  }

  function family(f: FamilyRow): OutLine {
    return {
      tag: 'FAM',
      xref: f.xref,
      children: [
        ...rows.factsOf(ownerKey('family', f.id)).map(fact),
        ...partner('HUSB', f.husband_id),
        ...partner('WIFE', f.wife_id),
        ...rows
          .childrenOf(String(f.id))
          .map((c) => pointer('CHIL', personXref.get(c.person_id)!)),
        ...optional('UID', f.uid),
        ...notes('family', f.id),
        ...citations('family', f.id),
        ...media.linksOf('family', f.id),
        ...changeOf(f)
      ]
    };
  }

  function source(s: SourceRow): OutLine {
    return {
      tag: 'SOUR',
      xref: s.xref,
      children: [
        ...(s.data_events === null
          ? []
          : [line('DATA', null, [line('EVEN', s.data_events)])]),
        ...optional('AUTH', s.author),
        ...optional('TITL', s.title),
        ...optional('PUBL', s.publisher),
        ...optional('TEXT', s.text),
        ...rows
          .repositoriesOf(String(s.id))
          .map((r) => pointer('REPO', repositoryXref.get(r.repository_id)!)),
        ...notes('source', s.id),
        ...changeOf(s)
      ]
    };
  }

  function repository(r: RepositoryRow): OutLine {
    return {
      tag: 'REPO',
      xref: r.xref,
      children: [
        line('NAME', r.name),
        ...address('repository', r.id),
        ...optional('PHON', r.phone),
        ...changeOf(r)
      ]
    };
  }

  function sharedNote(n: SharedNoteRow): OutLine {
    return {
      tag: 'SNOTE',
      xref: n.xref,
      value: n.text,
      children: [...citations('shared_note', n.id), ...changeOf(n)]
    };
  }

  function submitter(s: SubmitterRow): OutLine {
    return {
      tag: 'SUBM',
      xref: s.xref,
      children: [
        line('NAME', s.name),
        ...address('submitter', s.id),
        ...optional('PHON', s.phone),
        ...optional('EMAIL', s.email),
        ...optional('WWW', s.website),
        ...changeOf(s)
      ]
    };
  }

  function header() {
    function meta(key: string) {
      return rows.meta.get(key) ?? null;
    }
    const submitterXref = meta('submitter');
    const placeForm = meta('place_form');
    return line('HEAD', null, [
      line('GEDC', null, [line('VERS', '7.0')]),
      line('SOUR', 'SUKULINJA', [line('NAME', 'Sukulinja')]),
      ...(submitterXref !== null &&
      rows.submitters.some((s) => s.xref === submitterXref)
        ? [pointer('SUBM', submitterXref)]
        : []),
      ...optional('COPR', meta('copyright')),
      ...optional('LANG', meta('language')),
      ...(placeForm === null
        ? []
        : [line('PLAC', null, [line('FORM', placeForm)])]),
      ...optional('NOTE', meta('header_note'))
    ]);
  }

  const records = [
    ...rows.persons.map(person),
    ...rows.families.map(family),
    ...rows.sources.map(source),
    ...rows.repositories.map(repository),
    ...rows.sharedNotes.map(sharedNote),
    ...rows.submitters.map(submitter)
  ];
  const text = writeGedcom([
    header(),
    ...records,
    ...media.records,
    line('TRLR')
  ]);
  return { text, entries: media.entries };
}
