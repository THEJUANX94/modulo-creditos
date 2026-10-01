import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
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
        // vitest.config.ts de la raíz no pertenece a ningún paquete: usa la configuración por defecto.
        projectService: { allowDefaultProject: ['vitest.config.ts'] },
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
    // En los repositories, las claves de los objetos las dicta la API de Prisma, no este código:
    // relaciones con el nombre de su tabla (Usuarios), agregados (_count, _sum) y llaves compuestas
    // (identificacion_tipoIdentificacion). Ahí no se verifica su formato.
    files: ['**/*Repository.ts'],
    rules: {
      // Va antes que la regla base: entre selectores igual de específicos, gana el primero.
      '@typescript-eslint/naming-convention': [
        'error',
        { selector: 'objectLiteralProperty', format: null },
        ...namingConvention,
      ],
    },
  },
  {
    // Reglas de los hooks de React (ADR 0012, pendiente resuelto en el ADR 0021).
    files: ['apps/web/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat['recommended-latest']],
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
    // Los componentes de shadcn/ui son código de terceros copiado por su CLI (ADR 0002): se ajustan a
    // mano solo donde contradicen el design system, y no se les exige la convención del proyecto.
    files: ['apps/web/src/components/ui/**'],
    extends: [tseslint.configs.disableTypeChecked],
    rules: { '@typescript-eslint/naming-convention': 'off' },
  },
  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  prettier,
);
