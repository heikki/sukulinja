// Which GEDCOM lines the import reads, by tag.

// GEDCOM 7's individual and family events and attributes.
export const PERSON_FACT_TAGS = new Set([
  'ADOP',
  'BAPM',
  'BARM',
  'BASM',
  'BIRT',
  'BLES',
  'BURI',
  'CENS',
  'CHR',
  'CHRA',
  'CONF',
  'CREM',
  'DEAT',
  'EMIG',
  'FCOM',
  'GRAD',
  'IMMI',
  'NATU',
  'ORDN',
  'PROB',
  'RETI',
  'WILL',
  'EVEN',
  'CAST',
  'DSCR',
  'EDUC',
  'IDNO',
  'NATI',
  'NCHI',
  'NMR',
  'OCCU',
  'PROP',
  'RELI',
  'RESI',
  'SSN',
  'TITL',
  'FACT'
]);

export const FAMILY_FACT_TAGS = new Set([
  'ANUL',
  'CENS',
  'DIV',
  'DIVF',
  'ENGA',
  'MARB',
  'MARC',
  'MARR',
  'MARL',
  'MARS',
  'EVEN',
  'NCHI',
  'RESI',
  'FACT'
]);

export const NAME_PIECE_TAGS = ['NPFX', 'GIVN', 'NICK', 'SPFX', 'SURN', 'NSFX'];

export const ADDRESS_PARTS = [
  'ADR1',
  'ADR2',
  'ADR3',
  'CITY',
  'STAE',
  'POST',
  'CTRY'
];

// Header lines kept in `meta`, for export to write back: what the file says
// about the tree, not about the program that wrote it.
export const HEADER_META: Array<[string[], string]> = [
  [['NOTE'], 'header_note'],
  [['COPR'], 'copyright'],
  [['LANG'], 'language'],
  [['PLAC', 'FORM'], 'place_form'],
  [['SUBM'], 'submitter']
];
