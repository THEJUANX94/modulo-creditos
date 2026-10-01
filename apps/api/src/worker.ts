import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as esperar } from 'node:timers/promises';
import { configWorker } from './config/configWorker';
import { procesarLote, tamanoLote } from './modules/webhooks/despachadorWebhooks';
import { prisma } from './shared/db/prisma';
import { logger } from './shared/logger';

// Worker del outbox del webhook (ADR 0006, ADR 0018). Es otro proceso del mismo código: en Docker,
// la misma imagen que la API con otro comando. No tiene estado: los eventos y su traza están en la BD.

// Mayor que el timeout por defecto (15 s): el lote en curso alcanza a registrar su resultado.
const tiempoMaximoApagadoMs = 20_000;
const apagado = new AbortController();

// Latido para el healthcheck de Docker (ADR 0022): se escribe al empezar cada vuelta del ciclo. Si el
// ciclo se cuelga, el archivo envejece y el contenedor queda unhealthy. Con la BD caída el ciclo sigue
// vivo (registra el error y espera), así que el latido sigue: mide el worker, no la BD.
const archivoLatido = path.join(tmpdir(), 'latidoWorker');
let latidoFallido = false;

async function latir(): Promise<void> {
  try {
    await writeFile(archivoLatido, new Date().toISOString());
  } catch (error) {
    // Se avisa una sola vez: el envío de los webhooks no depende del latido.
    if (!latidoFallido) logger.warn({ err: error, archivoLatido }, 'No se pudo escribir el latido');
    latidoFallido = true;
  }
}

async function ciclo(): Promise<void> {
  while (!apagado.signal.aborted) {
    await latir();
    let tomados = 0;
    try {
      tomados = await procesarLote();
    } catch (error) {
      logger.error({ err: error }, 'No se pudo leer el outbox');
    }
    if (tomados < tamanoLote) {
      await esperar(configWorker.intervaloMs, undefined, { signal: apagado.signal }).catch(
        () => undefined,
      );
    }
  }
}

// Apagado ordenado: deja de tomar eventos y espera a que el lote en curso registre su resultado.
// Si algo se cuelga, sale a la fuerza; un evento a medias vuelve a salir al vencer su lease.
function apagar(senal: NodeJS.Signals): void {
  if (apagado.signal.aborted) return;
  logger.info({ senal }, 'Apagando: el worker termina el lote en curso');
  apagado.abort();

  const forzar = setTimeout(() => {
    logger.error('Apagado forzado: quedaron envíos sin registrar');
    process.exit(1);
  }, tiempoMaximoApagadoMs);
  forzar.unref();
}

process.on('SIGTERM', apagar);
process.on('SIGINT', apagar);

const destino = new URL(configWorker.webhookUrl);
logger.info(
  {
    destino: `${destino.origin}${destino.pathname}`,
    maxIntentos: configWorker.maxIntentos,
    backoffBaseMs: configWorker.backoffBaseMs,
    timeoutMs: configWorker.timeoutMs,
    intervaloMs: configWorker.intervaloMs,
  },
  'Worker del webhook iniciado',
);

await ciclo();
await prisma.$disconnect();
logger.info('Worker detenido');
