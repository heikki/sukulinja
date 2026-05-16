/** @type {import("prettier").Config} */
const config = {
  quoteProps: 'consistent',
  semi: true,
  singleQuote: true,
  trailingComma: 'none',
  plugins: ['@ianvs/prettier-plugin-sort-imports'],
  importOrder: [
    '<THIRD_PARTY_MODULES>',
    '',
    '^@(client|common|components|server)/.*$',
    '',
    '^[./]'
  ],
  importOrderParserPlugins: ['typescript', 'decorators']
};

export default config;
