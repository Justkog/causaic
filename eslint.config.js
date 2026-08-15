import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

const applicationImportPatterns = [
  {
    group: ['@causaic/runner', '@causaic/runner/*'],
    message: 'Shared packages must not import from applications.',
  },
];

const privateDomainImportPatterns = [
  {
    group: ['@causaic/cloud-domain', '@causaic/cloud-domain/*'],
    message: 'Public packages must not depend on private cloud-domain policy.',
  },
];

const publicSourceGlobs = [
  'apps/desktop/src/**/*.ts',
  'apps/desktop/src/**/*.tsx',
  'apps/runner/src/**/*.ts',
  'packages/coordinator-convex/src/**/*.ts',
  'packages/coordinator-core/src/**/*.ts',
  'packages/coordinator-memory/src/**/*.ts',
  'packages/workflow-schema/src/**/*.ts',
  'packages/runner-core/src/**/*.ts',
  'packages/runtime-fake/src/**/*.ts',
  'workflows/**/*.ts',
];

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/require-await': 'off',
    },
  },
  {
    files: [
      'packages/protocol/src/**/*.ts',
      'packages/cloud-domain/src/**/*.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...applicationImportPatterns,
            ...privateDomainImportPatterns,
            {
              group: ['@causaic/runtime-*', '@causaic/runtime-*/*'],
              message:
                'Protocol and domain must not depend on runtime packages.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/runtime-core/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...applicationImportPatterns,
            ...privateDomainImportPatterns,
          ],
        },
      ],
    },
  },
  {
    files: publicSourceGlobs,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: privateDomainImportPatterns,
        },
      ],
    },
  },
);
