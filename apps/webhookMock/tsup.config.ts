import { defineConfig } from 'tsup';

// Como en la API: @creditos/shared se incluye en el bundle; el resto se instala en la imagen.
export default defineConfig({
  entry: ['src/server.ts'],
  format: 'esm',
  platform: 'node',
  target: 'node24',
  outDir: 'dist',
  clean: true,
  noExternal: ['@creditos/shared'],
});
