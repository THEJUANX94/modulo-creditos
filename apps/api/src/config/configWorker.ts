import { z } from 'zod';
import { configBase, validarVariables } from './configBase';

// Configuración del worker del webhook (ADR 0018): la base común más el destino, el secreto de la
// firma y la política de reintentos. Solo la importa worker.ts: la API nunca tiene el secreto.
const prefijoSecreto = 'whsec_';

const esquemaVariablesWorker = z.object({
  // https obligatorio en producción; http solo en desarrollo y pruebas (el mock local).
  WEBHOOK_URL: z
    .url({ protocol: /^https?$/, error: 'Debe ser una URL http o https' })
    .refine(
      (url) => configBase.nodeEnv !== 'production' || url.startsWith('https://'),
      'En producción debe ser https',
    ),
  // Formato de Standard Webhooks: whsec_ + base64. La clave del HMAC son los bytes decodificados.
  WEBHOOK_SECRETO: z
    .string()
    .startsWith(prefijoSecreto, `Debe empezar por ${prefijoSecreto} (formato de Standard Webhooks)`)
    .transform((valor) => valor.slice(prefijoSecreto.length))
    .pipe(z.base64(`Después de ${prefijoSecreto} debe ir base64`))
    .transform((base64) => Buffer.from(base64, 'base64'))
    .refine((clave) => clave.length >= 32, 'Debe tener al menos 32 bytes decodificados'),
  WEBHOOK_MAX_INTENTOS: z.coerce.number().int().min(1).max(20).default(6),
  // Espera antes del intento n+1: base × 2^(n-1), con jitter de ±20 %.
  WEBHOOK_BACKOFF_BASE_MS: z.coerce.number().int().min(100).max(3_600_000).default(10_000),
  // La spec de Standard Webhooks sugiere de 15 a 30 s. El tope de 30 s queda bajo el lease (60 s).
  WEBHOOK_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30_000).default(15_000),
  WEBHOOK_INTERVALO_MS: z.coerce.number().int().min(100).max(60_000).default(2_000),
});

const variables = validarVariables(esquemaVariablesWorker);

export const configWorker = {
  ...configBase,
  webhookUrl: variables.WEBHOOK_URL,
  webhookSecreto: variables.WEBHOOK_SECRETO,
  maxIntentos: variables.WEBHOOK_MAX_INTENTOS,
  backoffBaseMs: variables.WEBHOOK_BACKOFF_BASE_MS,
  timeoutMs: variables.WEBHOOK_TIMEOUT_MS,
  intervaloMs: variables.WEBHOOK_INTERVALO_MS,
} as const;
