import { createApp } from './app';
import { config } from './config/config';
import { obtenerHashFicticio } from './modules/auth/contrasenas';
import { prisma } from './shared/db/prisma';
import { logger } from './shared/logger';

const tiempoMaximoApagadoMs = 10_000;

// El hash ficticio del login se calcula antes de aceptar peticiones: si se calculara con el primer
// correo inexistente, esa respuesta tardaría distinto y delataría que el correo no existe.
await obtenerHashFicticio();

const server = createApp().listen(config.port, () => {
  logger.info({ port: config.port, nodeEnv: config.nodeEnv }, 'API escuchando');
});

// Apagado ordenado: deja de aceptar conexiones, espera las peticiones en curso y cierra la BD.
// Si algo se cuelga, sale a la fuerza pasado el tiempo máximo.
let apagando = false;

function apagar(senal: NodeJS.Signals): void {
  if (apagando) return;
  apagando = true;
  logger.info({ senal }, 'Apagando: no se aceptan conexiones nuevas');

  const forzar = setTimeout(() => {
    logger.error('Apagado forzado: quedaron peticiones sin terminar');
    process.exit(1);
  }, tiempoMaximoApagadoMs);
  forzar.unref();

  server.close((error) => {
    void prisma.$disconnect().finally(() => {
      logger.info('API detenida');
      process.exit(error ? 1 : 0);
    });
  });
  server.closeIdleConnections();
}

process.on('SIGTERM', apagar);
process.on('SIGINT', apagar);
