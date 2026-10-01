import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import {
  esquemaDetalleEventoWebhook,
  esquemaEventoCreditoCreado,
  esquemaEventoWebhook,
  esquemaFiltrosEventosWebhook,
  tipoEventoCreditoCreado,
} from '@creditos/shared';
import { z } from 'zod';
import {
  cuerpoJson,
  errores,
  erroresAutenticacion,
  respuestaJson,
  seguridadBearer,
  sobreExito,
  sobreLista,
} from '../../docs/ayudasDocs';
import { esquemaEventIdWebhook } from './webhooksController';

export function registrarDocsWebhooks(registro: OpenAPIRegistry): void {
  const comunes = { tags: ['Webhook'], security: seguridadBearer };

  registro.registerPath({
    ...comunes,
    method: 'get',
    path: '/api/webhooks/eventos',
    summary: 'Traza del webhook: eventos del outbox, lo más reciente primero (solo ADMIN)',
    description:
      'Con creditoId, la notificación de un crédito; con estado=FALLIDO, las que no se entregaron.',
    request: { query: esquemaFiltrosEventosWebhook },
    responses: {
      200: respuestaJson('Eventos', sobreLista(esquemaEventoWebhook)),
      ...errores('VALIDACION_FALLIDA', 'SIN_PERMISO', ...erroresAutenticacion),
    },
  });

  registro.registerPath({
    ...comunes,
    method: 'get',
    path: '/api/webhooks/eventos/{eventId}',
    summary: 'Detalle de un evento: el payload enviado y cada intento (solo ADMIN)',
    request: { params: esquemaEventIdWebhook },
    responses: {
      200: respuestaJson('Evento', sobreExito(esquemaDetalleEventoWebhook)),
      ...errores(
        'VALIDACION_FALLIDA',
        'SIN_PERMISO',
        'EVENTO_WEBHOOK_NOT_FOUND',
        ...erroresAutenticacion,
      ),
    },
  });

  // Lo que la API envía al sistema externo (sección `webhooks` de OpenAPI 3.1).
  registro.registerWebhook({
    tags: ['Webhook'],
    method: 'post',
    path: tipoEventoCreditoCreado,
    summary: 'Notificación de crédito creado, que el worker envía al sistema externo',
    description:
      'Firmado con Standard Webhooks (standardwebhooks.com). Entrega al menos una vez: el receptor ' +
      'deduplica por webhook-id. Se reintenta ante timeout, error de red, 408, 429 y 5xx, con ' +
      'backoff exponencial; cualquier otro status, incluidas las redirecciones, es un rechazo definitivo.',
    request: {
      headers: z.object({
        'webhook-id': z.uuid().meta({ description: 'Igual a eventId: no cambia entre reintentos' }),
        'webhook-timestamp': z.string().meta({
          description:
            'Segundos Unix del envío. El receptor rechaza los que se alejen más de 5 min',
          example: '1790000000',
        }),
        'webhook-signature': z.string().meta({
          description:
            'v1,<base64 de HMAC-SHA256 con el secreto, sobre "webhook-id.webhook-timestamp.cuerpo">',
          example: 'v1,K5oZfzN95Z9UVu1EsfQmfVNQhnkZ2pj9o9NDN/H/pI4=',
        }),
        'x-request-id': z.string().optional().meta({
          description: 'La petición que creó el crédito, para rastrear un caso entre sistemas',
        }),
      }),
      body: cuerpoJson(esquemaEventoCreditoCreado),
    },
    responses: {
      '2XX': { description: 'Entregado' },
      '5XX': {
        description: 'Se reintenta con backoff, igual que el timeout, el error de red, 408 y 429',
      },
      '4XX': { description: 'FALLIDO sin reintentos (salvo 408 y 429), igual que los 3xx' },
    },
  });
}
