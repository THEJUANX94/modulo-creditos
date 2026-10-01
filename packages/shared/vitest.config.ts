import { defineProject } from 'vitest/config';

// Unitarias de los contratos compartidos: esquemas, transiciones y permisos. Sin BD ni red.
export default defineProject({
  test: {
    name: 'shared',
    include: ['tests/**/*.test.ts'],
  },
});
