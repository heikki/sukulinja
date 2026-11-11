// How many people a Photo is linked to or tagged in, under its thumbnail.
export function peopleLine(n: number) {
  if (n === 0) return 'No one';
  return n === 1 ? '1 person' : `${n} people`;
}
