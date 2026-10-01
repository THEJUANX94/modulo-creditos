import { z } from 'zod';

// Configuración del mock del sistema externo (ADR 0020). Única lectura de process.env.

// acepta: 200. falla: 503 (se reintenta). rechaza: 400 (FALLIDO de inmediato). lento: responde
// tarde (TIMEOUT). intermitente: falla al azar la mitad. fallaPrimeros: falla los primeros N envíos
// de cada evento y después acepta.
export const modos = [
  'acepta',
  'falla',
  'rechaza',
  'lento',
  'intermitente',
  'fallaPrimeros',
] as const;

export type Modo = (typeof modos)[number];

export const esquemaFallasPorEvento = z.coerce.number().int().min(1).max(10);

const esquemaVariables = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  // El mismo secreto que el worker (WEBHOOK_SECRETO de la API). La librería valida el base64.
  WEBHOOK_SECRETO: z
    .string()
    .startsWith('whsec_', 'Debe empezar por whsec_ (formato de Standard Webhooks)'),
  MOCK_MODO: z.enum(modos).default('acepta'),
  MOCK_FALLAS_POR_EVENTO: esquemaFallasPorEvento.default(2),
  // Mayor que el timeout del worker (15 s), para que el modo lento produzca un TIMEOUT.
  MOCK_RETRASO_MS: z.coerce.number().int().min(1000).max(120_000).default(20_000),
});

const resultado = esquemaVariables.safeParse(process.env);

if (!resultado.success) {
  console.error(`Configuración inválida:\n${z.prettifyError(resultado.error)}`);
  process.exit(1);
}

export const config = {
  puerto: resultado.data.PORT,
  secreto: resultado.data.WEBHOOK_SECRETO,
  modoInicial: resultado.data.MOCK_MODO,
  fallasPorEventoInicial: resultado.data.MOCK_FALLAS_POR_EVENTO,
  retrasoMs: resultado.data.MOCK_RETRASO_MS,
} as const;
