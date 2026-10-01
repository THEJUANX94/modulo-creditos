import { z } from 'zod';
import { configBase, validarVariables } from './configBase';

// Configuración de la API: la base común más las variables propias de la API.
const esquemaVariablesApi = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
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
  // Clave HS256 de los access tokens: al menos 32 caracteres aleatorios (ADR 0016).
  JWT_SECRET: z.string().min(32, 'Debe tener al menos 32 caracteres'),
  // Swagger en /api/docs. Se apaga en un despliegue real para no publicar el mapa de la API.
  DOCS_HABILITADA: z
    .enum(['true', 'false'])
    .default('true')
    .transform((valor) => valor === 'true'),
});

const variables = validarVariables(esquemaVariablesApi);

export const config = {
  ...configBase,
  port: variables.PORT,
  corsOrigins: variables.CORS_ORIGINS,
  trustProxy: variables.TRUST_PROXY,
  jwtSecret: variables.JWT_SECRET,
  docsHabilitada: variables.DOCS_HABILITADA,
} as const;
