// Whether a tool input fits its JSON schema, for the tools Claude is given
// without `strict` (catalogue.ts): what's wrong with it, or null. It knows
// what the operations' schemas use: types (one, or a list with null),
// enums, closed objects and arrays.

type Schema = Record<string, unknown>;

function typeOf(value: unknown) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
}

function typeFits(type: unknown, value: unknown) {
  const actual = typeOf(value);
  const types = Array.isArray(type) ? (type as string[]) : [type as string];
  return types.some(
    (t) => t === actual || (t === 'number' && actual === 'integer')
  );
}

export function misfit(
  schema: Schema,
  value: unknown,
  at = 'input'
): string | null {
  if (schema.type !== undefined && !typeFits(schema.type, value)) {
    return `${at} should be ${JSON.stringify(schema.type)}`;
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    return `${at} should be one of ${schema.enum.join(', ')}`;
  }
  if (Array.isArray(value) && schema.items !== undefined) {
    return itemsMisfit(schema.items as Schema, value, at);
  }
  if (typeOf(value) === 'object' && schema.properties !== undefined) {
    return objectMisfit(schema, value as Record<string, unknown>, at);
  }
  return null;
}

function itemsMisfit(items: Schema, value: unknown[], at: string) {
  for (const [i, item] of value.entries()) {
    const wrong = misfit(items, item, `${at}[${i}]`);
    if (wrong !== null) return wrong;
  }
  return null;
}

function objectMisfit(
  schema: Schema,
  value: Record<string, unknown>,
  at: string
) {
  const properties = schema.properties as Record<string, Schema>;
  for (const key of (schema.required ?? []) as string[]) {
    if (!(key in value)) return `${at}.${key} is missing`;
  }
  for (const [key, field] of Object.entries(value)) {
    const property = properties[key];
    if (property === undefined) {
      if (schema.additionalProperties === false) {
        return `${at}.${key} isn't asked for`;
      }
      continue;
    }
    const wrong = misfit(property, field, `${at}.${key}`);
    if (wrong !== null) return wrong;
  }
  return null;
}
