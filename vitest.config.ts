import { defineConfig } from 'vitest/config';

// Pruebas del monorepo (ADR 0008). Un proyecto por paquete, y la API partida en dos: las unitarias
// corren sin BD, y las de integración contra un SQL Server real. `pnpm test` corre todo.
export default defineConfig({
  test: {
    projects: [
      'packages/shared/vitest.config.ts',
      'apps/api/vitest.unitarias.config.ts',
      'apps/api/vitest.integracion.config.ts',
    ],
    // En modo proyectos, la cobertura es global: se configura aquí. Reporte sin umbral.
    coverage: {
      provider: 'v8',
      include: ['packages/shared/src/**/*.ts', 'apps/api/src/**/*.ts'],
      exclude: ['apps/api/src/generated/**'],
      reporter: ['text-summary', 'html'],
    },
  },
});
