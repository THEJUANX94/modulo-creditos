import { defineConfig } from 'tsup';

// @creditos/shared se publica como fuentes TS: se incluye en el bundle.
// El resto de dependencias queda externa y se instala en la imagen.
export default defineConfig({
  entry: ['src/server.ts', 'src/worker.ts'],
  format: 'esm',
  platform: 'node',
  target: 'node24',
  outDir: 'dist',
  clean: true,
  noExternal: ['@creditos/shared'],
});
