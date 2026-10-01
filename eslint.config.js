import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

// Convención de nombres de docs/02-desarrollo/convenciones.md.
// Las propiedades admiten UPPER_CASE por las variables de entorno y los valores
// fijados por el enunciado (SOLICITADO, CREDITO_NOT_FOUND…).
const namingConvention = [
  { selector: 'default', format: ['camelCase'], leadingUnderscore: 'allow' },
  { selector: 'import', format: ['camelCase', 'PascalCase'] },
  { selector: 'typeLike', format: ['PascalCase'] },
  { selector: 'enumMember', format: ['UPPER_CASE'] },
  { selector: ['objectLiteralProperty', 'typeProperty'], format: ['camelCase', 'UPPER_CASE'] },
  {
    selector: ['objectLiteralProperty', 'typeProperty'],
    modifiers: ['requiresQuotes'],
    format: null,
  },
  { selector: 'variable', modifiers: ['destructured'], format: null },
];

export default defineConfig(
  { ignores: ['**/dist/', '**/coverage/', '**/generated/', 'docs/'] },
  eslint.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/naming-convention': ['error', ...namingConvention],
    },
  },
  {
    // Express 5 maneja las promesas rechazadas de los handlers async (ADR 0012):
    // pasar un handler async a router.get() es correcto.
    rules: {
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { arguments: false } },
      ],
    },
  },
  {
    // En los repositories, los campos de relación de Prisma llevan el nombre de su tabla
    // (Usuarios, Sesiones…), que va en PascalCase: aparecen como claves en select e include.
    files: ['**/*Repository.ts'],
    rules: {
      // Va antes que la regla base: entre selectores igual de específicos, gana el primero.
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'objectLiteralProperty',
          format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
        },
        ...namingConvention,
      ],
    },
  },
  {
    // Los componentes React van en PascalCase.
    files: ['**/*.tsx'],
    rules: {
      '@typescript-eslint/naming-convention': [
        'error',
        ...namingConvention,
        { selector: ['function', 'variable'], format: ['camelCase', 'PascalCase'] },
      ],
    },
  },
  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  prettier,
);
