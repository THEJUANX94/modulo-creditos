import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { defineProject } from 'vitest/config';

// Integración HTTP con Supertest contra SQL Server real, en una BD de pruebas que se recrea en cada
// corrida (ADR 0008). Los archivos corren en serie: hay una sola sesión por usuario y un solo
// outbox, y las tablas inmutables no se pueden limpiar entre pruebas.

// La BD de pruebas sale de DATABASE_URL cambiando solo el nombre de la BD: mismo servidor y mismo
// login de mínimo privilegio. Los secretos son aleatorios en cada corrida.
function crearEntornoPruebas(): Record<string, string> {
  const archivoEnv = path.join(import.meta.dirname, '.env');
  const variables = existsSync(archivoEnv) ? parseEnv(readFileSync(archivoEnv, 'utf8')) : {};
  const urlDesarrollo = process.env.DATABASE_URL ?? variables.DATABASE_URL;
  const nombreBd = /database=ModuloCreditos(?=;|$)/i;
  if (!urlDesarrollo || !nombreBd.test(urlDesarrollo)) {
    throw new Error(
      'Las pruebas necesitan DATABASE_URL (en apps/api/.env o en el entorno) con database=ModuloCreditos',
    );
  }

  return {
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: urlDesarrollo.replace(nombreBd, 'database=ModuloCreditosPruebas'),
    CORS_ORIGINS: 'http://localhost:5173',
    JWT_SECRET: randomBytes(48).toString('base64url'),
    // La usa el script de usuarios demo para crear los cuatro usuarios de prueba.
    USUARIOS_DEMO_CLAVE: randomBytes(18).toString('base64url'),
    // Worker con valores cortos: los reintentos se ven en milisegundos. El receptor de las
    // pruebas escucha en el puerto de esta URL.
    WEBHOOK_URL: 'http://localhost:4100/webhooks/creditos',
    WEBHOOK_SECRETO: `whsec_${randomBytes(32).toString('base64')}`,
    WEBHOOK_MAX_INTENTOS: '4',
    WEBHOOK_BACKOFF_BASE_MS: '100',
    WEBHOOK_TIMEOUT_MS: '1000',
    WEBHOOK_INTERVALO_MS: '100',
  };
}

export default defineProject({
  test: {
    name: 'api-integracion',
    include: ['tests/integracion/**/*.test.ts'],
    env: crearEntornoPruebas(),
    globalSetup: ['tests/integracion/apoyo/setupGlobal.ts'],
    setupFiles: ['tests/integracion/apoyo/setupArchivo.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 120_000,
  },
});
