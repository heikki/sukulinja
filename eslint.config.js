import love from 'eslint-config-love';

export default [
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/build/**',
      '**/.hutch/**',
      'scratch-*'
    ]
  },
  {
    ...love,
    files: ['**/*.js', '**/*.ts', '**/*.tsx'],
    rules: {
      ...love.rules,
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-magic-numbers': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-type-assertion': 'off',
      '@typescript-eslint/prefer-destructuring': 'off',
      '@typescript-eslint/promise-function-async': 'off',
      'func-style': ['error', 'declaration'],
      'no-console': 'off',
      'no-plusplus': 'off',
      'max-lines': [
        'error',
        { max: 500, skipBlankLines: true, skipComments: true }
      ],
      'require-unicode-regexp': 'off'
    }
  },
  {
    // The Citations are reached through their index.ts, and by tests
    // through testing.ts; the tools in scripts/ are theirs and reach inside.
    files: ['src/**/*.ts'],
    ignores: ['src/server/citations/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: 'citations/(?!testing$)',
              message:
                'Import the Citations from citations (index.ts), or citations/testing in a test.'
            }
          ]
        }
      ]
    }
  },
  {
    // Inside the Citations, MyHeritage's references are reached through
    // myheritage/index.ts, so the folder can go once they're converted.
    files: ['src/server/citations/**/*.ts'],
    ignores: [
      'src/server/citations/myheritage/**',
      'src/server/citations/**/*.test.ts',
      'src/server/citations/testing.ts'
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: 'myheritage/',
              message:
                "Import MyHeritage's references from myheritage (its index.ts)."
            }
          ]
        }
      ]
    }
  }
];
