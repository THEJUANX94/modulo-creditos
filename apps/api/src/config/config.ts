import { z } from 'zod';

// Única lectura de process.env de la API: el resto del código usa `config`.
// Si una variable falta o es inválida, la API no arranca y dice cuál.
const esquemaVariables = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z
    .string()
    .startsWith('sqlserver://', 'Debe ser una cadena de conexión sqlserver://'),
  CORS_ORIGINS: z
    .string()
    .transform((valor) =>
      valor
        .split(',')
        .map((origen) => origen.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.url()).min(1)),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
});

const resultado = esquemaVariables.safeParse(process.env);

if (!resultado.success) {
  console.error(`Configuración inválida:\n${z.prettifyError(resultado.error)}`);
  process.exit(1);
}

const variables = resultado.data;

export const config = {
  nodeEnv: variables.NODE_ENV,
  port: variables.PORT,
  logLevel: variables.LOG_LEVEL,
  databaseUrl: variables.DATABASE_URL,
  corsOrigins: variables.CORS_ORIGINS,
  trustProxy: variables.TRUST_PROXY,
} as const;
