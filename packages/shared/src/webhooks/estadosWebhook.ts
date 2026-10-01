// Mismos valores que CK_WebhookEventos_estado y CK_WebhookIntentos_resultado (002-esquema.sql).

// PENDIENTE: espera su próximo intento. ENTREGADO: el receptor respondió 2xx.
// FALLIDO: se agotaron los intentos o el receptor lo rechazó de forma definitiva (ADR 0018).
export const estadosEventoWebhook = ['PENDIENTE', 'ENTREGADO', 'FALLIDO'] as const;

export type EstadoEventoWebhook = (typeof estadosEventoWebhook)[number];

export const resultadosIntentoWebhook = ['EXITOSO', 'ERROR_HTTP', 'TIMEOUT', 'ERROR_RED'] as const;

export type ResultadoIntentoWebhook = (typeof resultadosIntentoWebhook)[number];
