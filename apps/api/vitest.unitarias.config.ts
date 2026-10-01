import { defineProject } from 'vitest/config';

// Unitarias de la API: funciones puras, sin BD ni configuración (ADR 0008).
export default defineProject({
  test: {
    name: 'api-unitarias',
    include: ['tests/unitarias/**/*.test.ts'],
  },
});
