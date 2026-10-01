import path from 'node:path';
import { defineProject } from 'vitest/config';

// Unitarias de la web (ADR 0021): cliente HTTP, acciones por rol y estado, formatos y formularios,
// con Testing Library sobre jsdom. Las reglas de negocio ya las prueba la API.
export default defineProject({
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  test: {
    name: 'web',
    include: ['tests/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['tests/preparar.ts'],
  },
});
