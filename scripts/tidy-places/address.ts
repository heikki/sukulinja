// Where a Fact was, as GEDCOM 7 has it (ADR-0023): PLAC is the place, its
// jurisdictions from the lowest up, down to a village, farm or building;
// ADDR is an address as written on a mailing label. MyHeritage writes a
// residence's place in its ADDR ("Talo, Kylä, Pitäjä, Lääni (Län),
// Finland"), so an address with no place beside it is taken for the place,
// unless it reads as a mailing address.

// A postal code: Finland's "00100", or a ZIP code, "97008" or "97008-7922".
const POSTAL_CODE = /\b\d{5}(?:-\d{4})?\b/u;

// Whether the address is one a letter is sent to, rather than a place.
export function isMailingAddress(address: string) {
  return POSTAL_CODE.test(address);
}

// The place and address a Fact recorded with them says: an address
// standing alone is its place, unless it's a mailing address.
export function placeOf(said: {
  place: string | null;
  address: string | null;
}): { place: string | null; address: string | null } {
  const { place, address } = said;
  if (place !== null || address === null || isMailingAddress(address)) {
    return { place, address };
  }
  return { place: address, address: null };
}
