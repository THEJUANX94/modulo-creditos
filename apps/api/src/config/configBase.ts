import { z } from 'zod';

// Variables comunes a la API y al worker. Además, cada proceso valida solo las suyas (config.ts
// para la API, configWorker.ts para el worker): ninguno exige ni recibe los secretos del otro.
// Estos archivos son la única lectura de process.env: el resto del código usa los objetos de config.
const esquemaVariablesBase = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z
    .string()
    .startsWith('sqlserver://', 'Debe ser una cadena de conexión sqlserver://'),
});

// Si una variable falta o es inválida, el proceso no arranca y dice cuál.
export function validarVariables<T extends z.ZodType>(esquema: T): z.output<T> {
  const resultado = esquema.safeParse(process.env);
  if (!resultado.success) {
    console.error(`Configuración inválida:\n${z.prettifyError(resultado.error)}`);
    process.exit(1);
  }
  return resultado.data;
}

const variables = validarVariables(esquemaVariablesBase);

export const configBase = {
  nodeEnv: variables.NODE_ENV,
  logLevel: variables.LOG_LEVEL,
  databaseUrl: variables.DATABASE_URL,
} as const;
