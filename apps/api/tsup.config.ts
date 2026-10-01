import { defineConfig } from 'tsup';

// @creditos/shared se publica como fuentes TS: se incluye en el bundle.
// El resto de dependencias queda externa y se instala en la imagen.
// crearUsuariosDemo se compila para el servicio usuariosDemo del docker-compose (ADR 0022).
export default defineConfig({
  entry: {
    server: 'src/server.ts',
    worker: 'src/worker.ts',
    crearUsuariosDemo: 'src/scripts/crearUsuariosDemo.ts',
  },
  format: 'esm',
  platform: 'node',
  target: 'node24',
  outDir: 'dist',
  clean: true,
  noExternal: ['@creditos/shared'],
});
