import { FlatCompat } from '@eslint/eslintrc';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import unusedImports from 'eslint-plugin-unused-imports';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    plugins: {
      'simple-import-sort': simpleImportSort,
      'unused-imports': unusedImports,
    },
    rules: {
      'simple-import-sort/imports': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    ignores: [
      // Dependencies
      '**/node_modules/**',
      // Build output
      '**/dist/**',
      '**/build/**',
      // Cache directories
      '**/.cache/**',
      // Coverage output
      '**/coverage/**',
      // Environment files
      '**/.env*',
      // Config files
      '**/config/*',
      'lint-staged.config.js',
      'tailwind.config.ts',
      'postcss.config.mjs',
      'next.config.mjs',
      // TypeScript declaration files
      '**/*.d.ts',
      // Package manager files
      'pnpm-lock.yaml',
      // Temporary files
      '**/temp.js',
      '**/tmp/**',
      // Test files
      '**/__tests__/**',
      '**/*.test.js',
      '**/*.spec.js',
      // Other common ignores
      '**/.git/**',
      '**/public/**',
      '**/.next/**/*',
    ],
  },
];

export default eslintConfig;
