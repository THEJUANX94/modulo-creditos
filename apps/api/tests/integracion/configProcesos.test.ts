import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Configuración separada por proceso (ADR 0018): cada uno exige solo sus variables y no arranca
// con una inválida. Se prueban los procesos reales (`node --import tsx`), porque la configuración
// se valida al cargar el módulo. La BD apunta a un puerto cerrado: un worker que alcance a
// arrancar no toca el outbox de las pruebas.

const dirApi = path.resolve(import.meta.dirname, '../..');
const bdInalcanzable =
  'sqlserver://localhost:1;database=Ninguna;user=nadie;password={x};encrypt=true;trustServerCertificate=true';
const secretoValido = `whsec_${randomBytes(32).toString('base64')}`;
const urlValida = 'http://localhost:4199/webhooks/creditos';

// El entorno de la prueba sin ninguna variable de la app: cada caso pasa solo las que quiere.
const variablesApp =
  /^(NODE_ENV|LOG_LEVEL|DATABASE_URL|PORT|CORS_ORIGINS|TRUST_PROXY|JWT_SECRET|DOCS_HABILITADA|WEBHOOK_\w+)$/;
const entornoLimpio = Object.fromEntries(
  Object.entries(process.env).filter(([nombre]) => !variablesApp.test(nombre)),
);

interface Resultado {
  codigo: number | null;
  salida: string;
}

// Corre el proceso hasta que termine, o hasta que imprima `listo` (y entonces lo detiene).
function correr(
  entrada: string,
  variables: Record<string, string>,
  listo?: string,
): Promise<Resultado> {
  return new Promise((resolver) => {
    const hijo = spawn(process.execPath, ['--import', 'tsx', entrada], {
      cwd: dirApi,
      env: { ...entornoLimpio, DATABASE_URL: bdInalcanzable, ...variables },
    });
    let salida = '';
    const leer = (parte: Buffer) => {
      salida += parte.toString();
      if (listo && salida.includes(listo)) hijo.kill();
    };
    hijo.stdout.on('data', leer);
    hijo.stderr.on('data', leer);
    hijo.on('exit', (codigo) => resolver({ codigo, salida }));
  });
}

describe('worker', () => {
  it('sin WEBHOOK_URL ni WEBHOOK_SECRETO → no arranca y nombra las dos', async () => {
    const { codigo, salida } = await correr('src/worker.ts', {});
    expect(codigo).toBe(1);
    expect(salida).toContain('WEBHOOK_URL');
    expect(salida).toContain('WEBHOOK_SECRETO');
  });

  it.each([
    [
      'un secreto sin el prefijo whsec_',
      { WEBHOOK_SECRETO: randomBytes(32).toString('base64') },
      'whsec_',
    ],
    [
      'un secreto de 16 bytes',
      { WEBHOOK_SECRETO: `whsec_${randomBytes(16).toString('base64')}` },
      '32 bytes',
    ],
    ['http con NODE_ENV=production', { NODE_ENV: 'production' }, 'https'],
    ['un timeout de 60 s (máximo 30 s)', { WEBHOOK_TIMEOUT_MS: '60000' }, 'WEBHOOK_TIMEOUT_MS'],
  ])('%s → no arranca', async (_caso, variables, mensaje) => {
    const { codigo, salida } = await correr('src/worker.ts', {
      WEBHOOK_URL: urlValida,
      WEBHOOK_SECRETO: secretoValido,
      ...variables,
    });
    expect(codigo).toBe(1);
    expect(salida).toContain(mensaje);
  });

  it('arranca sin JWT_SECRET ni CORS_ORIGINS: no necesita los secretos de la API', async () => {
    const { salida } = await correr(
      'src/worker.ts',
      { WEBHOOK_URL: urlValida, WEBHOOK_SECRETO: secretoValido, LOG_LEVEL: 'info' },
      'Worker del webhook iniciado',
    );
    expect(salida).toContain('Worker del webhook iniciado');
  });
});

describe('API', () => {
  it('sin JWT_SECRET → no arranca', async () => {
    const { codigo, salida } = await correr('src/server.ts', {
      CORS_ORIGINS: 'http://localhost:5173',
    });
    expect(codigo).toBe(1);
    expect(salida).toContain('JWT_SECRET');
  });

  it('arranca sin ninguna WEBHOOK_*: no necesita el secreto del webhook', async () => {
    const { salida } = await correr(
      'src/server.ts',
      {
        PORT: '3998',
        CORS_ORIGINS: 'http://localhost:5173',
        JWT_SECRET: randomBytes(48).toString('base64url'),
        LOG_LEVEL: 'info',
      },
      'API escuchando',
    );
    expect(salida).toContain('API escuchando');
  });
});
