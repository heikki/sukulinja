// How many people a Photo is linked to or tagged in, under its thumbnail;
// a Photo with no one says nothing.
export function peopleLine(n: number) {
  if (n === 0) return null;
  return n === 1 ? '1 person' : `${n} people`;
}
